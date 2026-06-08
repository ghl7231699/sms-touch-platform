export function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone || '';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}
