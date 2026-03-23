let deputies = []
let divisionFilter = "all"
let isAdmin = false

/* rank layout */

const commandRanks = ["Sheriff","Undersheriff","Chief Deputy"]
const terminatedRanks = ["Terminations/Resignations"]
const mainRanks = ["Major","Captain","Lieutenant","Sergeant","Corporal","Senior Deputy","Deputy","Probationary Deputy","Reserve Deputy"]

/* login */

function goADMIN(){window.location.href="/admin.html"}
function goFTO(){window.location.href="/fto.html"}
function signIn(){window.location.href="/login.html"}

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

async function checkLogin(){

 try{

  const r = await fetch("/me",{credentials:"include"})
  const d = await r.json()

  const signin=document.getElementById("signinBtn")
  const signout=document.getElementById("signoutBtn")
  const info=document.getElementById("info")
  const adminBtn=document.getElementById("adminBtn")
  const ftoBtn=document.getElementById("ftoBtn")

  if(!d.loggedIn){

   if(signin) signin.style.display="inline-block"
   if(signout) signout.style.display="none"
   if(adminBtn) adminBtn.style.display="none"
   if(ftoBtn) ftoBtn.style.display="none"
   if(info) info.innerText=""

   return
  }

  if(signin) signin.style.display="none"
  if(signout) signout.style.display="inline-block"

  if(info){
   info.innerText=`(${d.callsign} ${d.rank} ${d.name})`
  }

  const commandAccess=["Sheriff","Undersheriff","Chief Deputy","Major","Captain"]
  const allowedDivisions=["HR","FTO"]

  const hasCommandRank=commandAccess.includes(d.rank)
  const hasDivision=d.divisions && d.divisions.some(div=>allowedDivisions.includes(div))

  if(ftoBtn && (hasCommandRank || hasDivision)){
   ftoBtn.style.display="inline-block"
  }

  if(adminBtn && d.admin){
   adminBtn.style.display="inline-block"
  }

 }catch(err){
  console.log("login check failed",err)
 }

}

async function signOut(){
 await fetch("/logout",{method:"POST",credentials:"include"})
 location.reload()
}

/* admin check */

async function checkAdmin(){

 try{

  const r=await fetch("/admin/check",{credentials:"include"})
  if(!r.ok) return

  const d=await r.json()

  if(d.admin) isAdmin=true

 }catch{
  console.log("admin check skipped")
 }

}

/* load roster */

async function load(){

 await checkLogin()
 await checkAdmin()

 try{

  const r=await fetch("/roster")

  if(!r.ok){
   deputies=[]
   render()
   return
  }

  const data=await r.json()

  if(Array.isArray(data)) deputies=data
  else if(Array.isArray(data.rows)) deputies=data.rows
  else deputies=[]

 }catch(e){

  console.error("Roster load error:",e)
  deputies=[]

 }

 render()
}

/* division filter */

function setDivision(div){
 divisionFilter=div
 render()
}

/* modal */

const modal=document.getElementById("profileModal")
const modalContent=document.getElementById("profileContent")

function closeProfile(){
 modal.style.display = "none"
 modalContent.innerHTML = ""
}

window.addEventListener("click", e=>{
 if(e.target === modal){
  closeProfile()
 }
})

window.addEventListener("keydown", e=>{
 if(e.key === "Escape" && modal.style.display === "block"){
  closeProfile()
 }
})


/* auto division toggle */
async function saveRank(id){
 const rank = document.getElementById("rankSelect").value

 const res = await fetch("/admin/set-rank/" + id,{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  credentials:"include",
  body:JSON.stringify({rank})
 })

 const data = await res.json()

 if(!res.ok || data.error){
  alert(data.error || "Failed to update rank")
  return
 }

 alert("Rank updated")
 closeProfile()
 load()
}



async function toggleDivision(id, division, checked){

 try{

  const r = await fetch("/admin/divisions/toggle",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   credentials:"include",
   body:JSON.stringify({
    deputy_id:id,
    division:division,
    enabled:checked
   })
  })

  if(!r.ok){
   console.error("Division update failed")
  }

 }catch(err){
  console.error("Division toggle error:",err)
 }

}

/* open profile */

async function openProfile(id){

 const r=await fetch("/profile/"+id,{credentials:"include"})
 const d=await r.json()

 const pr=await fetch("/promotion-history/"+id,{credentials:"include"})
 const promotions=await pr.json()

 const disciplineRes=await fetch("/disciplinary/"+id,{credentials:"include"})
 const discipline=await disciplineRes.json()

 const divRes=await fetch("/admin/divisions/"+id,{credentials:"include"})
 const divisions=await divRes.json()

 let historyHTML=""

 promotions.forEach(p=>{

  const deletePromotionButton = isAdmin
   ? `<br><button class="danger" onclick="removePromotion(${p.id}, ${d.id})">Delete Promotion</button>`
   : ""

  historyHTML+=`
  <li>
  ${p.old_rank} (${p.old_callsign})
  →
  ${p.new_rank} (${p.new_callsign})
  <br>
  Promoted by: ${p.promoted_by}
  <br>
  ${new Date(p.created).toLocaleDateString()}
  ${deletePromotionButton}
  </li>
  `
 })

 let disciplineHTML=""
 let strikeCount=0
 let verbalCount=0

 discipline.forEach(x=>{

  if(x.type==="strike") strikeCount++
  if(x.type==="verbal") verbalCount++

  const deleteButton = isAdmin && (x.type === "strike" || x.type === "verbal")
   ? `<br><button class="danger" onclick="removeDiscipline(${x.id}, ${d.id}, '${x.type}')">
        Remove ${x.type.charAt(0).toUpperCase() + x.type.slice(1)}
      </button>`
   : ""

  disciplineHTML+=`
  <li>
  <strong>${x.type.toUpperCase()}</strong>
  <br>
  ${x.reason||""}
  <br>
  Issued by: ${x.issued_by}
  <br>
  ${new Date(x.created).toLocaleDateString()}
  ${deleteButton}
  </li>
  `
 })

 const adminControls=isAdmin?`
 <div class="profile-right">

 <h3>Admin Controls</h3>

 <div class="discipline-bar">
 <div class="discipline-stat">Verbals: ${verbalCount} / 2</div>
 <div class="discipline-stat">Strikes: ${strikeCount} / 3</div>
 </div>

 <button onclick="addDiscipline(${d.id},'verbal')">Issue Verbal</button>
 <button onclick="addDiscipline(${d.id},'strike')">Issue Strike</button>
 <button onclick="addDiscipline(${d.id},'note')">Add Note</button>
 
 <button onclick="resetPassword(${d.id})">Reset Password</button>

 <button onclick="promoteDeputy(${d.id})">Promote</button>
 <button onclick="demoteDeputy(${d.id})">Demote</button>

 <button onclick="fireDeputy(${d.id})" class="danger">Fire Deputy</button>

 <h4>Divisions</h4>

 <div id="divisionBoxes">

 <label><input type="checkbox" value="CID" class="divisionBox" onchange="toggleDivision(${d.id},this.value,this.checked)"> CID</label>
 <label><input type="checkbox" value="ERT" class="divisionBox" onchange="toggleDivision(${d.id},this.value,this.checked)"> ERT</label>
 <label><input type="checkbox" value="FTO" class="divisionBox" onchange="toggleDivision(${d.id},this.value,this.checked)"> FTO</label>
 <label><input type="checkbox" value="HR" class="divisionBox" onchange="toggleDivision(${d.id},this.value,this.checked)"> HR</label>
 <label><input type="checkbox" value="K-9" class="divisionBox" onchange="toggleDivision(${d.id},this.value,this.checked)"> K-9</label>
 <label><input type="checkbox" value="SRT" class="divisionBox" onchange="toggleDivision(${d.id},this.value,this.checked)"> SRT</label>
 <label><input type="checkbox" value="SWAT" class="divisionBox" onchange="toggleDivision(${d.id},this.value,this.checked)"> SWAT</label>
 <label><input type="checkbox" value="TEU" class="divisionBox" onchange="toggleDivision(${d.id},this.value,this.checked)"> TEU</label>
 <label><input type="checkbox" value="Wildlife" class="divisionBox" onchange="toggleDivision(${d.id},this.value,this.checked)"> Wildlife</label>

 </div>

 <h4>Rank</h4>

 <select id="rankSelect">
 <option value="Sheriff">Sheriff</option>
 <option value="Undersheriff">Undersheriff</option>
 <option value="Chief Deputy">Chief Deputy</option>
 <option value="Major">Major</option>
 <option value="Captain">Captain</option>
 <option value="Lieutenant">Lieutenant</option>
 <option value="Sergeant">Sergeant</option>
 <option value="Corporal">Corporal</option>
 <option value="Senior Deputy">Senior Deputy</option>
 <option value="Deputy">Deputy</option>
 <option value="Probationary Deputy">Probationary Deputy</option>
 <option value="Reserve Deputy">Reserve Deputy</option>
 <option value="Terminations/Resignations">Terminations/Resignations</option>
 </select>

 <button onclick="saveRank(${d.id})">Save Rank</button>

 <h4>Callsign</h4>
 <input id="callsignInput" type="text" placeholder="Edit callsign">
 <button onclick="saveCallsign(${d.id})">Save Callsign</button>

 </div>

 </div>
 `:""

 modalContent.innerHTML=`
 <div class="profile-header">
 <h2 class="profile-header-title">
 ${d.callsign} ${d.rank} ${d.name}
 </h2>
 <button class="profile-close" onclick="closeProfile()">✕</button>
 </div>

 <div class="profile-main">

 <div class="profile-left">

 <img src="/photos/${d.photo||"default.jpg"}" class="profile-photo">

 <p><strong>Hire Date:</strong> ${new Date(d.hire_date).toLocaleDateString()}</p>

 <h3>Promotion History</h3>
 <ul class="promotion-history">
 ${historyHTML||"<li>No promotion history</li>"}
 </ul>

 <h3>Disciplinary History</h3>
 <ul class="discipline-history">
 ${disciplineHTML||"<li>No disciplinary records</li>"}
 </ul>

 </div>

 ${adminControls}

 </div>
 `

 modal.style.display="block"

 const rankSelect = document.getElementById("rankSelect")
 if(rankSelect){
  rankSelect.value = d.rank
 }

 const callsignInput = document.getElementById("callsignInput")
 if(callsignInput){
  callsignInput.value = d.callsign || ""
 }

 const boxes=document.querySelectorAll(".divisionBox")

 boxes.forEach(b=>{
  if(divisions.includes(b.value)){
   b.checked=true
  }
 })
}

async function addDiscipline(id,type){

 const reason=prompt("Enter reason")
 if(!reason) return

 await fetch("/admin/discipline/"+id,{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  credentials:"include",
  body:JSON.stringify({type,reason})
 })

 openProfile(id)
}


async function removePromotion(promotionId, deputyId){
 const confirmed = confirm("Are you sure you want to delete this promotion record?")
 if(!confirmed) return

 const res = await fetch("/admin/promotion/" + promotionId, {
  method: "DELETE",
  credentials: "include"
 })

 const data = await res.json()

 if(!res.ok){
  alert(data.error || "Failed to delete promotion")
  return
 }

 openProfile(deputyId)
}


async function saveCallsign(id){
 const callsignInput=document.getElementById("callsignInput")
 if(!callsignInput) return

 const callsign=callsignInput.value.trim()

 if(!callsign){
  alert("Please enter a callsign")
  return
 }

 const res=await fetch("/admin/callsign/"+id,{
  method:"POST",
  credentials:"include",
  headers:{
   "Content-Type":"application/json"
  },
  body:JSON.stringify({callsign})
 })

 const data=await res.json()

 if(!res.ok){
  alert(data.error||"Failed to update callsign")
  return
 }

 openProfile(id)
}


async function removeDiscipline(entryId, deputyId, type){
 const confirmed = confirm(`Are you sure you want to remove this ${type}?`)
 if(!confirmed) return

 const res = await fetch("/disciplinary/" + entryId, {
  method: "DELETE",
  credentials: "include"
 })

 if(!res.ok){
  alert("Failed to remove disciplinary record.")
  return
 }

 openProfile(deputyId)
}

async function fireDeputy(id){
 const res = await fetch("/api/terminations/fire",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  credentials:"include",
  body:JSON.stringify({ id })
 })

 if(!res.ok){
  alert("Failed to fire deputy")
  return
 }

 alert("Deputy fired")
 closeProfile()
 load()
}

/* render roster */

function render(){

 const commandBoard=document.getElementById("commandBoard")
 const board=document.getElementById("board")

 commandBoard.innerHTML=""
 board.innerHTML=""

 renderRankGroup(commandRanks,commandBoard)
 renderRankGroup(mainRanks,board)

}

/* rank columns */

function renderRankGroup(rankList,container){

 rankList.forEach(rank=>{

  const column=document.createElement("div")
  column.className="column"

  const title=document.createElement("h2")
  title.innerText=rank
  column.appendChild(title)

  column.ondragover=e=>e.preventDefault()

  column.ondrop=async e=>{

   e.preventDefault()

   const id=e.dataTransfer.getData("id")

   await fetch("/admin/promotion/"+id,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    credentials:"include",
    body:JSON.stringify({rank})
   })

   load()

  }

 deputies
 .filter(d=>{

  if(d.rank!==rank) return false

  if(divisionFilter!=="all"){
   if(!d.divisions) return false
   if(!d.divisions.includes(divisionFilter)) return false
  }

  return true

 })
 .sort((a,b)=>{
  const numA=parseInt(a.callsign.split("-")[1])
  const numB=parseInt(b.callsign.split("-")[1])
  return numA-numB
 })
 .forEach(d=>{

  const card=document.createElement("div")
  card.className="card"

  if(isAdmin){
   card.draggable=true
   card.onclick=()=>openProfile(d.id)

   card.ondragstart=e=>{
    e.dataTransfer.setData("id",d.id)
   }
  }

  const img=document.createElement("img")
  img.src=d.photo?"/photos/"+d.photo:"/photos/default.jpg"

  img.onerror=()=>{img.src="/photos/default.jpg"}

  const info=document.createElement("div")
  info.className="info"

  info.innerHTML=`
  <strong>${d.name}</strong>
  <span>${d.callsign}</span>
  <span>${(d.divisions||[]).join(", ")}</span>
  `

  card.appendChild(img)
  card.appendChild(info)

  column.appendChild(card)

 })

 container.appendChild(column)

 })

}

load()
