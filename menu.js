const menu = document.querySelector('#menu');
const links = document.querySelector('#links');
function toggleMenu(open) {
  links.classList.toggle('open', open);
  menu.setAttribute('aria-expanded', String(open));
}
menu.addEventListener('click', () => toggleMenu(!links.classList.contains('open')));
links.addEventListener('click', event => {
  if (event.target.closest('a')) toggleMenu(false);
});
document.querySelector('.nav').addEventListener('keydown', event => {
  if (event.key === 'Escape' && links.classList.contains('open')) {
    toggleMenu(false);
    menu.focus();
  }
});
