
const id=new URLSearchParams(location.search).get('id')


async function checkAdmin(){

 const r = await fetch("/admin/check",{
  credentials:"include"
 })

 if(!r.ok){
  window.location = "/login.html"
 }

 const d = await r.json()

 if(!d.admin){
  window.location = "/"
 }

}

checkAdmin()



async function load(){

let r=await fetch('/profile/'+id)
let d=await r.json()

name.innerText=d.name
rank.innerText='Rank: '+d.rank
callsign.innerText='Callsign: '+d.callsign
division.innerText='Division: '+(d.division||'')
hire.innerText='Hire Date: '+d.hire_date

if(d.photo) photo.src='/photos/'+d.photo

let n=await fetch('/notes/'+id).then(r=>r.json())
notes.innerHTML=n.map(x=>x.note).join('<br>')

let p=await fetch('/promotions/'+id).then(r=>r.json())
promos.innerHTML=p.map(x=>x.rank+' '+x.created).join('<br>')

}

load()
