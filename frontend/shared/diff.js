(function () {
  function renderWordDiff(textA, textB, left, right) {
    const changes = window.Diff ? Diff.diffWords(textA || '', textB || '') : [{ value: textA || '' }, { value: textB || '' }];
    const a = [], b = [];
    changes.forEach(part => {
      const html = document.createElement('span'); html.textContent = part.value;
      if (!part.added && !part.removed) { const x = html.cloneNode(true), y = html.cloneNode(true); x.className = 'match'; y.className = 'match'; a.push(x); b.push(y); }
      else if (part.removed) a.push(html);
      else if (part.added) b.push(html);
    });
    left.replaceChildren(...a); right.replaceChildren(...b);
  }
  window.renderWordDiff = renderWordDiff;
}());
