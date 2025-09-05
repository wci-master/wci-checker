// This file contains the core logic of the application, including functions for checking link accessibility, validating required files based on assignment type, calculating grades, and displaying results.

const defaultRules = {
  "Web Development": ["index.html", "style.css", "script.js"],
  "Data Analysis": ["notebook.ipynb", "data.csv"],
  "Generative AI": ["model.py", "requirements.txt"],
  "Cybersecurity": ["log.txt", "script.py"],
  "Graphics/Design": ["design.png", "design.psd"]
};

const gradingWeights = {
  accessibility: 0.4,
  requiredFiles: 0.3,
  structure: 0.3
};

const form = document.getElementById('checker-form');
const resultCard = document.getElementById('result-card');
const recentResultsDiv = document.getElementById('recent-results');

function detectLinkType(url) {
  if (/github\.io/.test(url)) return 'github-pages';
  if (/github\.com\/[^\/]+\/[^\/]+/.test(url)) return 'github-repo';
  if (/drive\.google\.com/.test(url)) return 'google-drive';
  return 'unknown';
}

async function checkAccessibility(url, type) {
  try {
    let fetchUrl = url;
    if (type === 'github-repo') {
      const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) return { passed: false, message: "Invalid GitHub repo URL." };
      fetchUrl = `https://api.github.com/repos/${match[1]}/${match[2]}`;
      const res = await fetch(fetchUrl);
      if (res.status === 200) return { passed: true, message: "Repo is public and accessible." };
      return { passed: false, message: "Repo not accessible or not public." };
    } else if (type === 'github-pages' || type === 'google-drive') {
      // HEAD with no-cors always returns opaque, so just assume accessible if no error
      await fetch(fetchUrl, { method: 'HEAD', mode: 'no-cors' });
      return { passed: true, message: "Link is accessible." };
    }
    return { passed: false, message: "Unknown link type." };
  } catch (e) {
    return { passed: false, message: "Link not accessible." };
  }
}

async function checkRequiredFiles(url, type, assignmentType) {
  const required = defaultRules[assignmentType] || [];
  if (type === 'github-repo') {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) return { passed: false, message: "Invalid GitHub repo URL.", found: [] };
    const apiUrl = `https://api.github.com/repos/${match[1]}/${match[2]}/contents/`;
    try {
      const res = await fetch(apiUrl);
      if (res.status !== 200) return { passed: false, message: "Cannot fetch repo contents.", found: [] };
      const files = await res.json();
      const fileNames = files.map(f => f.name);
      const missing = required.filter(f => !fileNames.includes(f));
      return {
        passed: missing.length === 0,
        message: missing.length === 0 ? "All required files found." : `Missing: ${missing.join(', ')}`,
        found: fileNames
      };
    } catch {
      return { passed: false, message: "Error checking files.", found: [] };
    }
  }
  if (type === 'github-pages') {
    let found = [];
    let missing = [];
    for (let file of required) {
      try {
        const fileUrl = url.replace(/\/$/, '') + '/' + file;
        await fetch(fileUrl, { method: 'HEAD', mode: 'no-cors' });
        found.push(file);
      } catch {
        missing.push(file);
      }
    }
    return {
      passed: missing.length === 0,
      message: missing.length === 0 ? "All required files found." : `Missing: ${missing.join(', ')}`,
      found
    };
  }
  if (type === 'google-drive') {
    try {
      await fetch(url, { method: 'HEAD', mode: 'no-cors' });
      return { passed: true, message: "File is accessible.", found: [url] };
    } catch {
      return { passed: false, message: "File not accessible.", found: [] };
    }
  }
  return { passed: false, message: "Unknown link type.", found: [] };
}

function checkStructure(type, assignmentType, foundFiles) {
  const required = defaultRules[assignmentType] || [];
  if (type === 'github-repo' || type === 'github-pages') {
    const missing = required.filter(f => !foundFiles.includes(f));
    return {
      passed: missing.length === 0,
      message: missing.length === 0 ? "Project structure is correct." : `Missing in root: ${missing.join(', ')}`
    };
  }
  return { passed: true, message: "N/A for Google Drive." };
}

function calculateScore(results) {
  let score = 0;
  if (results.accessibility.passed) score += gradingWeights.accessibility * 100;
  if (results.requiredFiles.passed) score += gradingWeights.requiredFiles * 100;
  if (results.structure.passed) score += gradingWeights.structure * 100;
  return Math.round(score);
}

function renderResultCard(data) {
  const { link, assignmentType, results, score } = data;
  resultCard.innerHTML = `
    <div class="meta"><b>Submission:</b> <a href="${link}" target="_blank">${link}</a></div>
    <div class="meta"><b>Assignment:</b> ${assignmentType}</div>
    <ul>
      <li><span class="${results.accessibility.passed ? 'pass' : 'fail'}">
        ${results.accessibility.passed ? '✅' : '❌'} Accessibility: ${results.accessibility.message}
      </span></li>
      <li><span class="${results.requiredFiles.passed ? 'pass' : 'fail'}">
        ${results.requiredFiles.passed ? '✅' : '❌'} Required Files: ${results.requiredFiles.message}
      </span></li>
      <li><span class="${results.structure.passed ? 'pass' : 'fail'}">
        ${results.structure.passed ? '✅' : '❌'} Structure: ${results.structure.message}
      </span></li>
    </ul>
    <div class="score">Final Score: ${score}%</div>
    <button class="export-btn" onclick="exportResult('csv')">Export CSV</button>
    <button class="export-btn" onclick="exportResult('json')">Export JSON</button>
  `;
  resultCard.classList.remove('hidden');
}

function exportResult(format) {
  const data = window.lastResult;
  if (!data) return;
  if (format === 'csv') {
    const csv = [
      ['Submission Link', 'Assignment Type', 'Accessibility', 'Required Files', 'Structure', 'Score'],
      [
        data.link,
        data.assignmentType,
        data.results.accessibility.passed ? 'Pass' : 'Fail',
        data.results.requiredFiles.passed ? 'Pass' : 'Fail',
        data.results.structure.passed ? 'Pass' : 'Fail',
        data.score
      ]
    ].map(row => row.map(v => `"${v}"`).join(',')).join('\n');
    downloadFile('result.csv', csv, 'text/csv');
  } else {
    downloadFile('result.json', JSON.stringify(data, null, 2), 'application/json');
  }
}
window.exportResult = exportResult;

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function saveRecentResult(data) {
  let recents = JSON.parse(localStorage.getItem('wci-recent-results') || '[]');
  recents.unshift(data);
  recents = recents.slice(0, 5);
  localStorage.setItem('wci-recent-results', JSON.stringify(recents));
}

function renderRecentResults() {
  let recents = JSON.parse(localStorage.getItem('wci-recent-results') || '[]');
  if (!recents.length) {
    recentResultsDiv.innerHTML = '';
    return;
  }
  recentResultsDiv.innerHTML = `<h2>Recent Results</h2>
    <ul>${recents.map((r, i) => `
      <li onclick="showRecentResult(${i})">
        ${r.assignmentType} &mdash; <a href="${r.link}" target="_blank">${r.link}</a> &mdash; <b>${r.score}%</b>
      </li>
    `).join('')}</ul>`;
}
window.showRecentResult = function(idx) {
  let recents = JSON.parse(localStorage.getItem('wci-recent-results') || '[]');
  if (recents[idx]) {
    window.lastResult = recents[idx];
    renderResultCard(recents[idx]);
  }
};

form.addEventListener('submit', async e => {
  e.preventDefault();
  resultCard.classList.add('hidden');
  const link = document.getElementById('submission-link').value.trim();
  const assignmentType = document.getElementById('assignment-type').value;
  if (!link || !assignmentType) return;
  const type = detectLinkType(link);

  // Accessibility
  const accessibility = await checkAccessibility(link, type);

  // Required files
  const requiredFiles = await checkRequiredFiles(link, type, assignmentType);

  // Structure
  const structure = checkStructure(type, assignmentType, requiredFiles.found || []);

  // Score
  const results = { accessibility, requiredFiles, structure };
  const score = calculateScore(results);

  const resultData = { link, assignmentType, results, score, timestamp: Date.now() };
  window.lastResult = resultData;
  renderResultCard(resultData);
  saveRecentResult(resultData);
  renderRecentResults();
});

renderRecentResults();