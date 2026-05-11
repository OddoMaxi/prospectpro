function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const nums = '23456789';
  const special = '@#$!';
  const all = upper + lower + nums;

  let pwd = '';
  pwd += upper[Math.floor(Math.random() * upper.length)];
  pwd += lower[Math.floor(Math.random() * lower.length)];
  pwd += nums[Math.floor(Math.random() * nums.length)];
  pwd += special[Math.floor(Math.random() * special.length)];
  for (let i = 0; i < 4; i++) pwd += all[Math.floor(Math.random() * all.length)];

  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

module.exports = { generatePassword };
