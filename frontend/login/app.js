const form = document.getElementById('login-form');
const errorNotice = document.getElementById('login-error');

document.getElementById('toggle-password').addEventListener('click', e => {
  const input = document.getElementById('password');
  input.type = input.type === 'password' ? 'text' : 'password';
  e.target.textContent = input.type === 'password' ? 'SHOW' : 'HIDE';
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  errorNotice.hidden = true;
  errorNotice.textContent = '';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const session = await EvalSyncAuth.login(email, password);
    const role = session.user.role;
    location.href = `../${role}/index.html`;
  } catch (err) {
    errorNotice.textContent = err.message || 'Invalid credentials. Please try again.';
    errorNotice.hidden = false;
  }
});
