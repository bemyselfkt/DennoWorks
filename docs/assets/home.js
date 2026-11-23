const resume = document.querySelector('#resume');

function updateResumeLink() {
  try {
    const location = localStorage.getItem('dennoworks-episode-0');
    const page = /^#(?:(?:vertical|single)-)?p(0[1-9]|[1-3][0-9]|4[0-3])$/.exec(location);
    resume.hidden = !page || Number(page[1]) === 1;
    if (!resume.hidden) {
      resume.href = `reader.html${location}`;
      resume.textContent = `続きから読む（${Number(page[1])}ページ）`;
    }
  } catch {
    resume.hidden = true;
  }
}

window.addEventListener('pageshow', updateResumeLink);
