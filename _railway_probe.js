require('dotenv').config();
var axios = require('axios');

var TOKEN = process.env.RAILWAY_API_TOKEN;
if (!TOKEN) { console.log('RAILWAY_API_TOKEN not set'); process.exit(1); }

console.log('Railway token loaded:', TOKEN.slice(0,8) + '...');

// Railway uses GraphQL API
var GQL = 'https://backboard.railway.app/graphql/v2';
var headers = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };

async function gql(query, variables) {
  var r = await axios.post(GQL, { query, variables }, { headers, timeout: 15000 });
  if (r.data.errors) throw new Error(JSON.stringify(r.data.errors[0]));
  return r.data.data;
}

async function run() {
  // 1. Get all projects
  console.log('\n[1] Fetching Railway projects...');
  var d1 = await gql('{ me { projects { edges { node { id name } } } } }');
  var projects = d1.me.projects.edges.map(function(e){ return e.node; });
  projects.forEach(function(p){ console.log('  Project:', p.id, '|', p.name); });

  if (!projects.length) { console.log('No projects found'); process.exit(1); }

  // 2. Get services for each project
  console.log('\n[2] Fetching services...');
  for (var i = 0; i < projects.length; i++) {
    var p = projects[i];
    var d2 = await gql(
      'query($id:String!){ project(id:$id){ services{ edges{ node{ id name } } } } }',
      { id: p.id }
    );
    var services = d2.project.services.edges.map(function(e){ return e.node; });
    services.forEach(function(s){ console.log('  Project:', p.name, '| Service:', s.id, '|', s.name); });
  }
}

run().catch(function(e){ console.log('ERROR:', e.message); process.exit(1); });
