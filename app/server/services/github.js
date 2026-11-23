const config = require('../config');
const common = require('../platform/common');
const log = require('../log');

const API = 'https://api.github.com';
let tokenCache = { value: undefined };
let cache = { at: 0, data: null, pending: null };

async function getToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  if (tokenCache.value !== undefined) return tokenCache.value;
  tokenCache.value = null;
  if (common.which('gh')) {
    const r = await common.run('gh', ['auth', 'token'], { timeout: 5000 });
    if (r.ok && r.stdout.trim()) {
      tokenCache.value = r.stdout.trim();
      log.info('github', 'uso il token di GitHub CLI (gh)');
    }
  }
  return tokenCache.value;
}

function settings() {
  const s = (config.get('services').github) || {};
  return {
    repositories: Array.isArray(s.repositories) ? s.repositories : [],
    owner: s.owner || process.env.GITHUB_OWNER || '',
    autoRepos: s.autoRepos || 6,
    refreshSeconds: s.refreshSeconds || 60
  };
}

async function gh(pathname, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'vibe-deck',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await common.fetchJson(API + pathname, { headers: headers, timeout: 8000 });
  if (!r.ok) {
    const err = new Error((r.data && r.data.message) || ('HTTP ' + r.status));
    err.status = r.status;
    if (r.status === 403 || r.status === 429) err.rateLimited = /rate limit/i.test(err.message);
    throw err;
  }
  return r.data;
}

function repoName(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && entry.owner && entry.repo) return entry.owner + '/' + entry.repo;
  return null;
}

async function listRepos(s, token) {
  const configured = s.repositories.map(repoName).filter(function (n) {
    return n && !/^YOUR_USER\//.test(n);
  });
  if (configured.length) return configured;
  if (token) {
    const repos = await gh('/user/repos?sort=pushed&per_page=' + s.autoRepos + '&affiliation=owner', token);
    return repos.map(function (r) { return r.full_name; });
  }
  if (s.owner) {
    const repos = await gh('/users/' + encodeURIComponent(s.owner) + '/repos?sort=pushed&per_page=' + s.autoRepos, null);
    return repos.map(function (r) { return r.full_name; });
  }
  return [];
}

const DEPLOY_RE = /deploy|release|publish|pages|\bcd\b/i;
function isDeploy(run) { return DEPLOY_RE.test(String(run.name || '')) || DEPLOY_RE.test(String(run.path || '')); }

async function repoSummary(full, token) {
  const base = '/repos/' + full;
  const [info, pulls, runs, commits] = await Promise.all([
    gh(base, token),
    gh(base + '/pulls?state=open&per_page=100', token).catch(function () { return []; }),
    gh(base + '/actions/runs?per_page=20', token).catch(function () { return null; }),
    gh(base + '/commits?per_page=1', token).catch(function () { return []; })
  ]);
  const prs = Array.isArray(pulls) ? pulls.length : 0;
  const list = (runs && runs.workflow_runs) || [];
  const run = list[0];
  const dep = list.filter(isDeploy)[0];
  const commit = Array.isArray(commits) && commits[0];
  return {
    name: info.name,
    full: info.full_name,
    url: info.html_url,
    private: !!info.private,
    stars: info.stargazers_count,
    prs: prs,
    issues: Math.max(0, (info.open_issues_count || 0) - prs),
    pushedAt: info.pushed_at,
    ci: run ? {
      status: run.status,
      conclusion: run.conclusion,
      name: run.name,
      url: run.html_url
    } : null,
    deploy: dep ? {
      status: dep.status,
      conclusion: dep.conclusion,
      name: dep.name,
      url: dep.html_url,
      at: dep.updated_at || dep.created_at
    } : null,
    commit: commit ? {
      message: String(commit.commit.message || '').split('\n')[0],
      author: (commit.commit.author && commit.commit.author.name) || '',
      date: commit.commit.author && commit.commit.author.date,
      url: commit.html_url
    } : null
  };
}

async function build() {
  const s = settings();
  const token = await getToken();
  const out = { configured: true, authenticated: !!token, repos: [], totals: { prs: 0, issues: 0, failing: 0, deployFailing: 0 }, error: null, updatedAt: Date.now() };
  let names;
  try {
    names = await listRepos(s, token);
  } catch (e) {
    out.error = e.rateLimited ? 'Limite API GitHub raggiunto: aggiungi GITHUB_TOKEN' : 'GitHub: ' + e.message;
    return out;
  }
  if (!names.length) {
    out.configured = false;
    out.error = 'Nessun repository: imposta GITHUB_TOKEN nel .env o "repositories" in config/services.json';
    return out;
  }
  const results = await Promise.all(names.slice(0, 12).map(function (n) {
    return repoSummary(n, token).catch(function (e) {
      return { full: n, name: n.split('/')[1], error: e.status === 404 ? 'non trovato' : e.message };
    });
  }));
  results.forEach(function (r) {
    out.repos.push(r);
    if (r.error) return;
    out.totals.prs += r.prs;
    out.totals.issues += r.issues;
    if (r.ci && r.ci.conclusion === 'failure') out.totals.failing++;
    if (r.deploy && r.deploy.conclusion === 'failure') out.totals.deployFailing++;
  });
  const failed = results.filter(function (r) { return r.error; });
  if (failed.length === results.length) out.error = 'GitHub non raggiungibile: ' + failed[0].error;
  return out;
}

async function summary(force) {
  const s = settings();
  const token = await getToken();
  const ttl = (token ? s.refreshSeconds : Math.max(s.refreshSeconds, 900)) * 1000;
  if (!force && cache.data && Date.now() - cache.at < ttl) return cache.data;
  if (cache.pending) return cache.pending;
  cache.pending = build().then(function (data) {
    if (data.error) log.warn('github', data.error);
    cache = { at: Date.now(), data: data, pending: null };
    return data;
  }).catch(function (e) {
    cache.pending = null;
    throw e;
  });
  return cache.pending;
}

function urlFor(full, what) {
  const data = cache.data;
  if (!data) return null;
  const repo = data.repos.filter(function (r) { return r.full === full && !r.error; })[0];
  if (!repo) return null;
  if (what === 'pulls') return repo.url + '/pulls';
  if (what === 'issues') return repo.url + '/issues';
  if (what === 'actions') return (repo.ci && repo.ci.url) || repo.url + '/actions';
  if (what === 'deploy') return (repo.deploy && repo.deploy.url) || repo.url + '/actions';
  return repo.url;
}

module.exports = { summary: summary, urlFor: urlFor, isDeploy: isDeploy };
