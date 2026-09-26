const form = document.getElementById('form');
const msg = document.getElementById('message');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = 'Submitting...';
  const data = new FormData(form);
  try {
    const r = await fetch('/api/applications', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      name:data.get('name'), email:data.get('email'), phone:data.get('phone'), dob:data.get('dob'), state:data.get('state'), citizen:data.has('citizen'), understands:data.has('understands')
    })});
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Unable to submit.');
    msg.textContent = `Application received. Your reference number is ${j.reference}. Save it for your records.`;
    form.reset();
  } catch (err) { msg.textContent = err.message; }
});
