'use strict';
const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('#main-navigation');
menuButton.addEventListener('click', () => { const expanded = menuButton.getAttribute('aria-expanded') === 'true'; menuButton.setAttribute('aria-expanded', String(!expanded)); nav.classList.toggle('open', !expanded); });
nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { nav.classList.remove('open'); menuButton.setAttribute('aria-expanded','false'); }));
const searchDialog = document.getElementById('search-dialog');
document.getElementById('search-button').addEventListener('click', () => { searchDialog.showModal(); document.getElementById('site-search').focus(); });
const routes = [
 ['Mathematics Programme', 'https://grandchallenge.github.io/MATH-PROGRAMME/'],
 ['P versus NP', 'https://grandchallenge.github.io/MATH-PROGRAMME/domains/p_vs_np/'],
 ['P versus NP from Above', 'https://grandchallenge.github.io/MATH-PROGRAMME/pnp_above/'],
 ['Erdős Compendium', 'https://grandchallenge.github.io/MATH-PROGRAMME/erdos/'],
 ['OpenAI Mathematics 2026', 'https://grandchallenge.github.io/MATH-PROGRAMME/oai26/'],
 ['AETHER', 'https://github.com/grandchallenge/AETHER'],
 ['MODULUS', 'https://github.com/grandchallenge/MODULUS'],
 ['Adaptive Intelligence Atlas', 'https://github.com/grandchallenge/ADAPTIVE-INTELLIGENCE-ATLAS'],
 ['Mathematics documentary library', 'https://grandchallenge.github.io/MATH-PROGRAMME/documentaries/'],
 ['MATHCERT', 'https://github.com/grandchallenge/MATHCERT'],
 ['Research method', '#method']
];
const searchField = document.getElementById('site-search');
const searchResults = document.getElementById('search-results');
function renderResults() {
 const query=searchField.value.toLowerCase().trim(); searchResults.replaceChildren();
 const matches=routes.filter(([label]) => label.toLowerCase().includes(query)).slice(0,8);
 for(const [label,url] of matches){const a=document.createElement('a');a.href=url;a.textContent=label+' →';searchResults.append(a);}
 if(!matches.length){const p=document.createElement('p');p.textContent='No matching programme in the quick index. Use the Mathematics Programme documentation for deeper searches.';searchResults.append(p);}
}
searchField.addEventListener('input',renderResults);
renderResults();