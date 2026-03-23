const express=require("express")
const session=require("express-session")
const bcrypt=require("bcrypt")
const multer=require("multer")
const {Pool}=require("pg")
const path=require("path")

const app=express()

const pool=new Pool({
 connectionString:process.env.DATABASE_URL,
 ssl:process.env.DATABASE_URL?{rejectUnauthorized:false}:false
})

const upload=multer({dest:path.join(__dirname,"public/photos")})

app.use(express.json())
app.use(express.urlencoded({extended:true}))

app.use(express.static(path.join(__dirname,"public")))

app.use(session({
 secret:"bcso-v8-secret",
 resave:false,
 saveUninitialized:false
}))

/* ===============================
   AUTH
================================ */

function auth(req,res,next){
 if(!req.session.user) return res.status(401).json({error:"login required"})
 next()
}

async function admin(req,res,next){
 const r=await pool.query("SELECT admin FROM deputies WHERE username=$1",[req.session.user])
 if(!r.rows.length||!r.rows[0].admin) return res.status(403).json({error:"admin only"})
 next()
}

/* ===============================
   FTO ACCESS CONTROL
================================ */

async function requireFTO(req, res, next) {

 if (!req.session.user) {
  return res.status(401).send("Login required")
 }

 try {

 const result = await pool.query(
 `
 SELECT 1
 FROM deputy_divisions dd
 JOIN deputies d ON d.id = dd.deputy_id
 WHERE d.username = $1
 AND dd.division IN ('FTO','HR')
 `,
 [req.session.user]
)

if (result.rows.length === 0) {
 return res.status(403).send("FTO/HR access only")
}

  next()

 } catch(err) {

  console.error("FTO CHECK ERROR:", err)
  res.status(500).json({error:"FTO check failed"})

 }

}
/* ===============================
   AUDIT LOG
================================ */
async function resetPassword(id){

 const newPassword = prompt("Enter new password")

 if(!newPassword) return

 const r = await fetch("/admin/reset-password/"+id,{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  credentials:"include",
  body:JSON.stringify({password:newPassword})
 })

 if(r.ok){
  alert("Password updated")
 }else{
  alert("Password reset failed")
 }

}

async function logAction(user,action){
 await pool.query(
  "INSERT INTO audit_logs(username,action,created) VALUES($1,$2,NOW())",
  [user,action]
 )
}

/* ===============================
   LOGIN
================================ */

app.post("/login",async(req,res)=>{

 const {username,password}=req.body

 const r=await pool.query(
  "SELECT * FROM deputies WHERE username=$1",
  [username]
 )

 if(!r.rows.length) return res.status(401).json({error:"invalid"})

 const valid=await bcrypt.compare(password,r.rows[0].password)

 if(!valid) return res.status(401).json({error:"invalid"})

 req.session.user=username

 res.json({success:true})

})

app.post("/logout",(req,res)=>{
 req.session.destroy(()=>res.json({success:true}))
})

/* ===============================
   PASSWORD
================================ */

app.post("/change-password",auth,async(req,res)=>{

 const {current,newpass}=req.body

 const r=await pool.query(
  "SELECT password FROM deputies WHERE username=$1",
  [req.session.user]
 )

 const valid=await bcrypt.compare(current,r.rows[0].password)

 if(!valid) return res.status(401).json({error:"wrong password"})

 const hash=await bcrypt.hash(newpass,10)

 await pool.query(
  "UPDATE deputies SET password=$1 WHERE username=$2",
  [hash,req.session.user]
 )

 await logAction(req.session.user,"Changed password")

 res.json({success:true})

})

app.post("/admin/callsign/:id", async (req, res) => {
 const id = Number(req.params.id)
 const callsign = req.body.callsign?.trim()

 if (!id) {
  return res.status(400).json({ error: "Invalid deputy id" })
 }

 if (!callsign) {
  return res.status(400).json({ error: "Callsign is required" })
 }

 try {
  const result = await pool.query(
   "UPDATE deputies SET callsign = $1 WHERE id = $2 RETURNING id, callsign",
   [callsign, id]
  )

  if (result.rowCount === 0) {
   return res.status(404).json({ error: "Deputy not found" })
  }

  res.json({
   success: true,
   deputy: result.rows[0]
  })
 } catch (err) {
  console.error(err)
  res.status(500).json({ error: "Failed to update callsign" })
 }
})


/* ===============================
   RANK SYSTEM
================================ */

const rankOrder=[

"Sheriff",
"Undersheriff",
"Chief Deputy",
"Major",
"Captain",
"Lieutenant",
"Sergeant",
"Corporal",
"Senior Deputy",
"Deputy",
"Probationary Deputy",
"Reserve Deputy"
]

const callsignRanges = {
  Sheriff: [1, 1],
  Undersheriff: [2, 2],
  "Chief Deputy": [3, 4],
  Major: [10, 10],
  Captain: [100, 104],
  Lieutenant: [200, 209],
  Sergeant: [300, 309],
  Corporal: [400, 409],
  "Senior Deputy": [500, 540],
  Deputy: [600, 640],
  "Probationary Deputy": [700, 740],
  "Reserve Deputy": [750, 799],
};

async function generateCallsign(rank) {
  const range = callsignRanges[rank];
  if (!range) return null;

  const [min, max] = range;

  const r = await pool.query(
    "SELECT callsign FROM deputies WHERE rank=$1",
    [rank]
  );

  const used = new Set(
    r.rows
      .map((x) => x.callsign)
      .filter(Boolean)
      .map((c) => parseInt(c.split("-")[1], 10))
      .filter((n) => !isNaN(n))
  );

  for (let i = min; i <= max; i++) {
    if (!used.has(i)) {
      return "C-" + String(i).padStart(3, "0");
    }
  }

  return null;
}

app.delete("/admin/promotion/:id", async (req, res) => {
 const id = Number(req.params.id)

 if(!id){
  return res.status(400).json({ error: "Invalid promotion id" })
 }

 try{
  const result = await pool.query(
   "DELETE FROM promotion_history WHERE id = $1 RETURNING id",
   [id]
  )

  if(result.rowCount === 0){
   return res.status(404).json({ error: "Promotion record not found" })
  }

  res.json({ success: true })
 }catch(err){
  console.error(err)
  res.status(500).json({ error: "Failed to delete promotion" })
 }
})


app.post("/admin/set-rank/:id", auth, admin, async (req, res) => {
  try {
    const id = req.params.id;
    const { rank } = req.body;

    const current = await pool.query(
      "SELECT rank, callsign FROM deputies WHERE id=$1",
      [id]
    );

    if (!current.rows.length) {
      return res.status(404).json({ error: "Deputy not found" });
    }

    const oldRank = current.rows[0].rank;
    const oldCallsign = current.rows[0].callsign;

    if (!callsignRanges[rank]) {
      return res.status(400).json({ error: "Invalid rank" });
    }

    const callsign = await generateCallsign(rank);

    if (!callsign) {
      return res.status(400).json({ error: "No callsigns available" });
    }

    await pool.query("BEGIN");

    await pool.query(
      "UPDATE deputies SET rank=$1, callsign=$2 WHERE id=$3",
      [rank, callsign, id]
    );

    await pool.query(
      `INSERT INTO promotion_history
       (deputy_id, old_rank, old_callsign, new_rank, new_callsign, promoted_by, created)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [id, oldRank, oldCallsign, rank, callsign, req.session.user]
    );

    await pool.query("COMMIT");

    res.json({ success: true, callsign });
  } catch (err) {
    try {
      await pool.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error("ROLLBACK ERROR:", rollbackErr);
    }

    console.error("SET RANK ERROR:", err);
    res.status(500).json({ error: "Failed to update rank" });
  }
});


app.post("/admin/reset-password/:id", auth, admin, async (req,res)=>{

 const id = req.params.id
 const { password } = req.body

 if(!password){
  return res.status(400).json({error:"Password required"})
 }

 const hash = await bcrypt.hash(password,10)

 await pool.query(
  "UPDATE deputies SET password=$1 WHERE id=$2",
  [hash,id]
 )

 res.json({success:true})

})

app.post("/admin/set-rank/:id", auth, admin, async (req,res)=>{
 try{
  const id = req.params.id
  const { rank } = req.body

  const callsignRanges = {
   "Sheriff":[1,1],
   "Undersheriff":[2,2],
   "Chief Deputy":[3,4],
   "Major":[10,10],
   "Captain":[100,104],
   "Lieutenant":[200,209],
   "Sergeant":[300,309],
   "Corporal":[400,409],
   "Senior Deputy":[500,540],
   "Deputy":[600,640],
   "Probationary Deputy":[700,740],
   "Reserve Deputy":[750,799]
  }

  const current = await pool.query(
   "SELECT rank, callsign FROM deputies WHERE id=$1",
   [id]
  )

  if(!current.rows.length){
   return res.status(404).json({error:"Deputy not found"})
  }

  const oldRank = current.rows[0].rank
  const oldCallsign = current.rows[0].callsign

  const range = callsignRanges[rank]

  if(!range){
   return res.status(400).json({error:"Invalid rank"})
  }

  const [min,max] = range

  const r = await pool.query(
   "SELECT callsign FROM deputies WHERE rank=$1 AND id<>$2",
   [rank,id]
  )

  const used = r.rows
   .map(x => x.callsign)
   .filter(Boolean)
   .map(x => parseInt(x.callsign ? x.callsign.split("-")[1] : "", 10))
   .filter(x => !isNaN(x))

  let next = min

  while(used.includes(next) && next <= max){
   next++
  }

  if(next > max){
   return res.status(400).json({error:"No callsigns available"})
  }

  const callsign = `C-${next}`

  await pool.query("BEGIN")

  await pool.query(
   "UPDATE deputies SET rank=$1, callsign=$2 WHERE id=$3",
   [rank,callsign,id]
  )

  await pool.query(
   `INSERT INTO promotion_history
    (deputy_id, old_rank, old_callsign, new_rank, new_callsign, promoted_by, created)
    VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
   [id, oldRank, oldCallsign, rank, callsign, req.session.user]
  )

  await pool.query("COMMIT")

  res.json({success:true})

 }catch(err){
  await pool.query("ROLLBACK")
  console.error("SET RANK ERROR:", err)
  res.status(500).json({error:"Failed to update rank"})
 }
})

app.post("/admin/demote/:id", auth, admin, async (req,res)=>{
 try{
  const id = req.params.id

  const r = await pool.query(
   "SELECT rank, callsign FROM deputies WHERE id=$1",
   [id]
  )

  if(!r.rows.length){
   return res.status(404).json({error:"Deputy not found"})
  }

  const oldRank = r.rows[0].rank
  const oldCallsign = r.rows[0].callsign

  const index = rankOrder.indexOf(oldRank)

  if(index === rankOrder.length - 1){
   return res.json({error:"Already lowest rank"})
  }

  const newRank = rankOrder[index + 1]
  const newCallsign = await generateCallsign(newRank)

  if(!newCallsign){
   return res.status(400).json({error:"No callsign available for new rank"})
  }

  await pool.query("BEGIN")

  await pool.query(
   "UPDATE deputies SET rank=$1, callsign=$2 WHERE id=$3",
   [newRank, newCallsign, id]
  )

  await pool.query(
   `INSERT INTO promotion_history
    (deputy_id, old_rank, old_callsign, new_rank, new_callsign, promoted_by, created)
    VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
   [id, oldRank, oldCallsign, newRank, newCallsign, req.session.user]
  )

  await pool.query("COMMIT")

  res.json({success:true})

 }catch(err){
  await pool.query("ROLLBACK")
  console.error("DEMOTE ERROR:", err)
  res.status(500).json({error:"Demotion failed"})
 }
})

/* ===============================
   FTO TRAINING SYSTEM
================================ */


/* ===============================
   CURRENT USER
================================ */
app.get("/api/check-termination-access", auth, async (req,res)=>{
 try{
  const username = req.session.user

  const result = await pool.query(
   `SELECT rank
    FROM deputies
    WHERE username=$1`,
   [username]
  )

  if(result.rows.length === 0){
   return res.json({allowed:false})
  }

  const deputy = result.rows[0]
  const rank = deputy.rank

  const allowedRanks = [
   "Sheriff",
   "Undersheriff",
   "Chief Deputy",
   "Major",
   "Captain"
  ]

  const hrCheck = await pool.query(
   `SELECT 1
    FROM deputy_divisions dd
    JOIN deputies d ON d.id = dd.deputy_id
    WHERE d.username=$1 AND dd.division='HR'`,
   [username]
  )

  const isHR = hrCheck.rowCount > 0

  if (allowedRanks.includes(rank) || isHR) {
   return res.json({allowed:true})
  }

  res.json({allowed:false})
 }catch(err){
  console.error(err)
  res.status(500).json({allowed:false})
 }
})

app.get("/terminations", auth, async (req,res)=>{

 try{

  const userId = req.session.user.id

  const user = await pool.query(
   "SELECT rank FROM deputies WHERE id=$1",
   [userId]
  )

  if(user.rowCount === 0){
   return res.status(403).json({error:"User not found"})
  }

  const rank = user.rows[0].rank

  const commandRanks = [
   "Sheriff",
   "Undersheriff",
   "Chief Deputy",
   "Major",
   "Captain"
  ]

  const isCommand = commandRanks.includes(rank)

  const hrCheck = await pool.query(
   "SELECT 1 FROM deputy_divisions WHERE deputy_id=$1 AND division='HR'",
   [userId]
  )

  const isHR = hrCheck.rowCount > 0

  if(!isCommand && !isHR){
   return res.status(403).json({error:"Access denied"})
  }

  const r = await pool.query(`
   SELECT d.*,
   ARRAY(
    SELECT division
    FROM deputy_divisions dd
    WHERE dd.deputy_id = d.id
   ) AS divisions
   FROM deputies d
   WHERE rank='Terminations/Resignations'
   ORDER BY callsign
  `)

  res.json(r.rows)

 }catch(err){

  console.error("Terminations route error:",err)
  res.status(500).json({error:"Server error"})

 }

})

app.get("/api/me", auth, async (req,res)=>{
 try{
  const r = await pool.query(
   "SELECT username, rank FROM deputies WHERE username=$1",
   [req.session.user]
  )

  if(!r.rows.length){
   return res.status(404).json({error:"User not found"})
  }

  res.json(r.rows[0])
 }catch(err){
  console.error(err)
  res.status(500).json({error:"Failed to load user"})
 }
})

app.get("/me", async (req,res)=>{

 if(!req.session.user){
  return res.json({loggedIn:false})
 }

 try{

  const user = await pool.query(
   `SELECT id,name,rank,callsign
    FROM deputies
    WHERE username=$1`,
   [req.session.user]
  )

  if(!user.rows.length){
   return res.json({loggedIn:false})
  }

  const d = user.rows[0]

  const divs = await pool.query(
   `SELECT division
    FROM deputy_divisions
    WHERE deputy_id=$1`,
   [d.id]
  )

  res.json({
   loggedIn:true,
   name:d.name,
   rank:d.rank,
   callsign:d.callsign,
   divisions: divs.rows.map(x=>x.division)
  })

 }catch(err){
  console.error(err)
  res.status(500).json({error:"user lookup failed"})
 }

})
app.get("/api/probationary-deputies",requireFTO,async(req,res)=>{

 const r=await pool.query(
  "SELECT id,name,callsign FROM deputies WHERE rank='Probationary Deputy'"
 )

 res.json(r.rows)

})

app.get("/api/terminations", auth, async (req,res)=>{
 const result = await pool.query(`
  SELECT id,name,hire_date,termination_date,notes
  FROM terminations
  ORDER BY termination_date DESC
 `)

 res.json(result.rows)
})

app.get("/api/terminations/update", auth, async (req,res)=>{

 try{

  const r = await pool.query(`
   SELECT
    d.id,
    d.name,
    d.callsign,
    d.hire_date,

    t.good_standing,
    t.bad_standing,
    t.blacklisted,
    t.termination_date,
    t.notes

   FROM deputies d

   LEFT JOIN terminations t
   ON d.id = t.deputy_id

   WHERE d.rank = 'Terminations/Resignations'

   ORDER BY d.callsign
  `)

  res.json(r.rows)

 }catch(err){

  console.error("Termination API error:",err)
  res.status(500).json({error:"Server error"})

 }

})

app.post("/api/terminations/fire", auth, async (req,res)=>{
 try{

  const { id } = req.body

  await pool.query("BEGIN")

  // Get deputy info
  const deputy = await pool.query(
   `SELECT id, name, hire_date
    FROM deputies
    WHERE id=$1`,
   [id]
  )

  if(deputy.rows.length === 0){
   await pool.query("ROLLBACK")
   return res.status(404).json({error:"Deputy not found"})
  }

  const { name, hire_date } = deputy.rows[0]

  // Insert into terminations
  await pool.query(
   `INSERT INTO terminations
    (id, name, hire_date, termination_date)
    VALUES ($1,$2,$3,NOW())`,
   [id,name,hire_date]
  )

  // Remove from deputies
  await pool.query(
   `DELETE FROM deputies WHERE id=$1`,
   [id]
  )

  await pool.query("COMMIT")

  res.json({success:true})

 }catch(err){
  await pool.query("ROLLBACK")
  console.error(err)
  res.status(500).json({error:"Database error"})
 }
})



app.post("/api/terminations/update", auth, async (req,res)=>{

 const { id, field, value } = req.body

 const allowed = [
  "hire_date",
  "good_standing",
  "bad_standing",
  "blacklisted",
  "termination_date",
  "notes"
 ]

 if(!allowed.includes(field)){
  return res.status(400).json({error:"Invalid field"})
 }

 await pool.query(
  `UPDATE deputies SET ${field}=$1 WHERE id=$2`,
  [value,id]
 )

 res.json({success:true})

})

app.get("/api/training/:id", async (req,res)=>{

 try{

  const deputyId = req.params.id

  const result = await pool.query(`
   SELECT
    ti.id AS item_id,
    ti.phase,
    ti.item_name,
    tp.status,
    tp.completed_by,
    tp.completed_at
   FROM training_items ti
   LEFT JOIN training_progress tp
    ON tp.training_item_id = ti.id
    AND tp.deputy_id = $1
   ORDER BY ti.phase, ti.id
  `,[deputyId])

  const phases = {}

  result.rows.forEach(row=>{

   if(!phases[row.phase]){
    phases[row.phase] = []
   }

   phases[row.phase].push({
    item_id: row.item_id,
    item_name: row.item_name,
    status: row.status || "pending",
    completed_by: row.completed_by,
    completed_at: row.completed_at
   })

  })

  res.json(phases)

 }catch(err){

  console.error("TRAINING ERROR:",err)
  res.status(500).json({error:"training load failed"})

 }

})

app.post("/admin/divisions/toggle", auth, admin, async (req,res)=>{

 const { deputy_id, division, enabled } = req.body

 if(enabled){

  await pool.query(
   "INSERT INTO deputy_divisions (deputy_id, division) VALUES ($1,$2) ON CONFLICT DO NOTHING",
   [deputy_id,division]
  )

 }else{

  await pool.query(
   "DELETE FROM deputy_divisions WHERE deputy_id=$1 AND division=$2",
   [deputy_id,division]
  )

 }

 res.json({success:true})

})

app.post("/api/training/notes/update", async (req, res) => {
 try {
  const { deputy_id, type, notes } = req.body

  if (type === "command") {
   await pool.query(`
    INSERT INTO training_notes (deputy_id, command_notes)
    VALUES ($1, $2)
    ON CONFLICT (deputy_id)
    DO UPDATE SET command_notes = EXCLUDED.command_notes
   `, [deputy_id, notes])
  }

  if (type === "fto") {
   await pool.query(`
    INSERT INTO training_notes (deputy_id, fto_notes)
    VALUES ($1, $2)
    ON CONFLICT (deputy_id)
    DO UPDATE SET fto_notes = EXCLUDED.fto_notes
   `, [deputy_id, notes])
  }

  res.json({ success: true })

 } catch (err) {
  console.error("NOTES UPDATE ERROR:", err)
  res.status(500).json({ error: "notes update failed" })
 }
})

app.get("/api/training/notes/:id", async (req, res) => {
 try {
  const { id } = req.params

  const result = await pool.query(
   "SELECT command_notes, fto_notes FROM training_notes WHERE deputy_id=$1",
   [id]
  )

  if (result.rows.length === 0) {
   return res.json({ command_notes: "", fto_notes: "" })
  }

  res.json(result.rows[0])

 } catch (err) {
  console.error("NOTES LOAD ERROR:", err)
  res.status(500).json({ error: "failed to load notes" })
 }
})


app.post("/api/training/update", requireFTO, async (req,res)=>{

 try{

  const {deputy_id,item_id,status} = req.body

  // get deputy name of the logged-in user
  const user = await pool.query(
   "SELECT name FROM deputies WHERE username=$1",
   [req.session.user]
  )

  const completedBy = user.rows[0].name

  await pool.query(`
   INSERT INTO training_progress
   (deputy_id,training_item_id,status,completed_by,completed_at)
   VALUES($1,$2,$3,$4,NOW())

   ON CONFLICT (deputy_id,training_item_id)
   DO UPDATE SET
    status = EXCLUDED.status,
    completed_by = EXCLUDED.completed_by,
    completed_at = NOW()
  `,[deputy_id,item_id,status,completedBy])

  res.json({success:true})

 }catch(err){

  console.error("TRAINING UPDATE ERROR:",err)
  res.status(500).json({error:"update failed"})

 }

})

app.get("/disciplinary/:id", auth, async (req,res)=>{
 try{
  const r = await pool.query(
   `SELECT id, type, reason, issued_by, created
    FROM disciplinary_history
    WHERE deputy_id=$1
    ORDER BY created DESC`,
   [req.params.id]
  )

  res.json(r.rows)
 }catch(err){
  console.error("DISCIPLINARY LOAD ERROR:", err)
  res.status(500).json({error:"failed to load disciplinary history"})
 }
})
/* ===============================
   ROSTER
================================ */

app.get("/roster",async(req,res)=>{

 const r=await pool.query(`
  SELECT
   d.id,
   d.name,
   d.callsign,
   d.rank,
   d.photo,
   ARRAY_AGG(dd.division)
    FILTER (WHERE dd.division IS NOT NULL)
    AS divisions
  FROM deputies d
  LEFT JOIN deputy_divisions dd
   ON d.id=dd.deputy_id
  GROUP BY d.id
  ORDER BY d.rank
 `)

 res.json(r.rows)

})

app.get("/admin/divisions/:id", auth, admin, async (req, res) => {

 const r=await pool.query(
  "SELECT division FROM deputy_divisions WHERE deputy_id=$1",
  [req.params.id]
 )

 const divisions = r.rows.map(row => row.division)

 res.json(divisions)

})

app.post("/admin/divisions/:id",auth,admin,async(req,res)=>{

 const {divisions} = req.body
 const id = req.params.id

 await pool.query(
 "DELETE FROM deputy_divisions WHERE deputy_id=$1",
 [id]
 )

 for(const d of divisions){

  await pool.query(
  "INSERT INTO deputy_divisions(deputy_id,division) VALUES($1,$2)",
  [id,d]
  )

 }

 res.json({success:true})

})

app.delete("/disciplinary/:id", auth, admin, async (req, res) => {
 try {
  const id = req.params.id

  if (!id || id === "undefined") {
   return res.status(400).json({ error: "Invalid disciplinary id" })
  }

  const result = await pool.query(
   "DELETE FROM disciplinary_history WHERE id=$1 RETURNING id",
   [id]
  )

  if (result.rowCount === 0) {
   return res.status(404).json({ error: "Disciplinary record not found" })
  }

  res.json({ success: true })
 } catch (err) {
  console.error("DISCIPLINARY DELETE ERROR:", err)
  res.status(500).json({ error: "Failed to delete disciplinary record" })
 }
})

app.get("/api/terminations/audit/:id", auth, async (req,res)=>{

 const result = await pool.query(`
  SELECT user_name as user, date
  FROM termination_audit
  WHERE deputy_id=$1
  ORDER BY date DESC
 `,[req.params.id])

 res.json(result.rows)

})

app.post("/admin/discipline/:id",auth,admin,async(req,res)=>{

 const {type,reason} = req.body

 await pool.query(
  `INSERT INTO disciplinary_history
  (deputy_id,type,reason,issued_by)
  VALUES($1,$2,$3,$4)`,
  [req.params.id,type,reason,req.session.user]
 )

 res.json({success:true})

})

/* ===============================
   ADMIN LIST
================================ */

app.get("/admin/deputies",auth,admin,async(req,res)=>{

 const r=await pool.query(
  "SELECT id,name,callsign,rank FROM deputies ORDER BY rank"
 )

 res.json(r.rows)

})

/* ===============================
   NOTES
================================ */

app.post("/create-deputy", async (req,res)=>{

 try{

  const {name, rank, hire_date} = req.body

  const username = name.replace(/\s+/g,"") // keeps original case

  const callsign = await generateCallsign(rank)

  const hash = await bcrypt.hash("Changeme123",10)

  await pool.query(`
   INSERT INTO deputies
   (name,callsign,rank,username,password,admin,
    can_promote,can_demote,can_add_notes,can_lockdown,
    created,hire_date,strikes,verbals)
   VALUES
   ($1,$2,$3,$4,$5,false,false,false,false,false,NOW(),$6,0,0)
  `,[
   name,
   callsign,
   rank,
   username,
   hash,
   hire_date
  ])

  res.json({
   success:true,
   username,
   password:"Changeme123"
  })

 }catch(err){

  console.error(err)
  res.status(500).json({error:"create failed"})

 }

})
/* ===============================
   PROFILE
================================ */

app.get("/profile/:id",auth,admin,async(req,res)=>{

 const r=await pool.query(
  "SELECT * FROM deputies WHERE id=$1",
  [req.params.id]
 )

 res.json(r.rows[0])

})


app.get("/promotion-history/:id", async (req, res) => {
 const deputyId = Number(req.params.id)

 if(!deputyId){
  return res.status(400).json({ error: "Invalid deputy id" })
 }

 try{
  const result = await pool.query(
   `SELECT id, old_rank, old_callsign, new_rank, new_callsign, promoted_by, created
    FROM promotion_history
    WHERE deputy_id = $1
    ORDER BY created DESC`,
   [deputyId]
  )

  res.json(result.rows)
 }catch(err){
  console.error(err)
  res.status(500).json({ error: "Failed to load promotion history" })
 }
})

/* ===============================
   ADMIN CHECK
================================ */

app.get("/admin/check",auth,async(req,res)=>{

 const r=await pool.query(
  "SELECT admin FROM deputies WHERE username=$1",
  [req.session.user]
 )

 res.json({admin:r.rows[0].admin})

})

app.delete("/admin/fire/:id", async (req, res) => {
  const deputyId = req.params.id
  const terminatedBy = req.user.id // assuming auth middleware

  try {

    const deputy = await pool.query(
      "SELECT id, name, rank, hire_date FROM deputies WHERE id=$1",
      [deputyId]
    )

    if (deputy.rows.length === 0) {
      return res.status(404).json({error:"Deputy not found"})
    }

    const d = deputy.rows[0]

    await pool.query(`
      INSERT INTO terminations
      (deputy_id,name,rank,hire_date,reason,standing,notes,terminated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `,[
      d.id,
      d.name,
      d.rank,
      d.hire_date,
      req.body.reason,
      req.body.standing,
      req.body.notes,
      terminatedBy
    ])

    await pool.query(
      "DELETE FROM deputies WHERE id=$1",
      [deputyId]
    )

    res.json({success:true})

  } catch(err){
    console.error(err)
    res.status(500).json({error:"Server error"})
  }
})

/* ===============================
   FTO PAGE PROTECTION
================================ */

app.get("/fto.html",requireFTO,(req,res)=>{
 res.sendFile(path.join(__dirname,"public/fto.html"))
})

/* ===============================
   ROOT
================================ */

app.get("/",(req,res)=>{
 res.sendFile(path.join(__dirname,"public/login.html"))
})

/* ===============================
   SERVER
================================ */

const PORT=process.env.PORT||3000

app.listen(PORT,()=>{
 console.log("BCSO v8 running on port",PORT)
})
