document.querySelectorAll('[data-select]').forEach(button => {
  button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.select);
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.getElementById('status').textContent = '선택된 글 위에서 우클릭 → GenuEarly 검사';
  });
});
