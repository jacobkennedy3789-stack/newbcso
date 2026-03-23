const table=document.getElementById("table")

async function load(){

 const r=await fetch("/admin/deputies",{credentials:"include"})
 const d=await r.json()

 let html='<tr><th>Name</th><th>Rank</th><th>Division</th><th>Actions</th></tr>'

 d.forEach(x=>{

 html+=`<tr>

 <td>${x.name}</td>
 <td>${x.rank}</td>
 <td>${x.division||""}</td>

 <td>
 <button onclick="profile(${x.id})">Profile</button>
 <button onclick="del(${x.id})">Delete</button>
 </td>

 </tr>`

 })

 table.innerHTML=html

}

function profile(id){
 location="profile.html?id="+id
}

async function del(id){

 await fetch("/admin/deputy/"+id,{
 method:"DELETE",
 credentials:"include"
 })

 load()

}

load()

function goBack(){
 window.history.back()
}

function showCreate(){
 document.getElementById("createForm").style.display="block"
}

createDeputyForm.onsubmit = async e => {

 e.preventDefault()

 const body = {
  name: document.getElementById("name").value,
  rank: document.getElementById("rank").value,
  hire_date: document.getElementById("hire_date").value
 }

 const r = await fetch("/create-deputy",{
  method:"POST",
  headers:{
   "Content-Type":"application/json"
  },
  credentials:"include",
  body:JSON.stringify(body)
 })

 const result = await r.json()

 if(result.error){
  alert(result.error)
 }else{
  alert("Deputy created")
  document.getElementById("createForm").style.display="none"
  load()
 }

}
