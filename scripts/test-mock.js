const response = await fetch('http://localhost:3100/api/manual-send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '18515385071', templateId: 'tpl_register' })
});

const json = await response.json();
console.log(JSON.stringify(json, null, 2));
