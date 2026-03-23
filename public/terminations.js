let terminations = []
let selected = null

async function checkAccess(){
 try{
  const res = await fetch("/api/check-termination-access",{credentials:"include"})
  if(!res.ok) throw new Error("Access API failed")

  const data = await res.json()

  if(!data.allowed){
   document.body.innerHTML = "<h1>Access Denied</h1>"
   return false
  }

  return true

 }catch(e){
  console.error(e)
  document.body.innerHTML = "<h1>Access Error</h1>"
  return false
 }
}

async function loadTerminations(){
 try{
  const res = await fetch("/api/terminations",{credentials:"include"})
  if(!res.ok) throw new Error("Failed to load terminations")

  terminations = await res.json()
  renderTable()

 }catch(err){
  console.error(err)
 }
}

function renderTable(){

 const body = document.getElementById("terminationsBody")
 if(!body) return

 body.innerHTML = ""

 const search = document.getElementById("searchBox")?.value?.toLowerCase() || ""
 const filter = document.getElementById("filterStatus")?.value || "all"

 terminations
 .filter(t=>{

  const name = (t.name || "").toLowerCase()

  const matchSearch =
   name.includes(search) ||
   String(t.id).includes(search)

  let matchFilter = true

  if(filter==="good") matchFilter = t.good_standing
  if(filter==="bad") matchFilter = t.bad_standing
  if(filter==="blacklisted") matchFilter = t.blacklisted

  return matchSearch && matchFilter

 })
 .forEach(t=>{

  const tr = document.createElement("tr")

  let status = "Unknown"
  if(t.good_standing) status = "Good Standing"
  if(t.bad_standing) status = "Bad Standing"
  if(t.blacklisted) status = "Blacklisted"

  tr.innerHTML = `
   <td>${t.id}</td>
   <td>${t.name}</td>
   <td>${new Date(t.hire_date).toLocaleDateString()}</td>
   <td>${new Date(t.termination_date).toLocaleDateString()}</td>
   <td>${status}</td>
  `

  tr.addEventListener("click",()=>openModal(t))

  body.appendChild(tr)

 })

}

async function openModal(t){

 selected = t

 document.getElementById("modalId").innerText = t.id
 document.getElementById("modalName").innerText = t.name
 document.getElementById("modalHire").innerText =
  new Date(t.hire_date).toLocaleDateString()
 document.getElementById("modalTermination").innerText =
  new Date(t.termination_date).toLocaleDateString()

 document.getElementById("notesField").value = t.notes || ""

 document.getElementById("modalOverlay").classList.remove("hidden")

 loadAuditLog(t.id)

}

async function loadAuditLog(id){

 try{

  const res = await fetch("/api/terminations/audit/"+id,{credentials:"include"})
  if(!res.ok) throw new Error("Audit fetch failed")

  const logs = await res.json()

  const box = document.getElementById("auditLog")
  box.innerHTML = ""

  logs.forEach(l=>{

   const div = document.createElement("div")
   div.className = "auditEntry"

   div.innerText =
    `${l.user} edited notes (${new Date(l.date).toLocaleString()})`

   box.appendChild(div)

  })

 }catch(e){
  console.error(e)
 }

}

document.addEventListener("DOMContentLoaded",()=>{

 const closeBtn = document.getElementById("closeModal")
 const saveBtn = document.getElementById("saveNotes")
 const searchBox = document.getElementById("searchBox")
 const filterStatus = document.getElementById("filterStatus")

 if(closeBtn){
  closeBtn.onclick = ()=>{
   document.getElementById("modalOverlay").classList.add("hidden")
  }
 }

 if(saveBtn){
  saveBtn.onclick = async ()=>{

   if(!selected) return

   const notes = document.getElementById("notesField").value

   await fetch("/api/terminations/update",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    credentials:"include",
    body: JSON.stringify({
     id: selected.id,
     field: "notes",
     value: notes
    })
   })

   loadTerminations()

  }
 }

 if(searchBox) searchBox.oninput = renderTable
 if(filterStatus) filterStatus.onchange = renderTable

 init()

})

async function init(){

 const allowed = await checkAccess()
 if(!allowed) return

 loadTerminations()

}
