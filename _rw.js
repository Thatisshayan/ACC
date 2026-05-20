require('dotenv').config();
var axios = require('axios');
var TOKEN = process.env.RAILWAY_API_TOKEN;
console.log('Token:', TOKEN ? TOKEN.slice(0,8) + '...' : 'MISSING');

var GQL = 'https://backboard.railway.app/graphql/v2';
var H   = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };

async function gql(q, v) {
  var r = await axios.post(GQL, { query: q, variables: v||{} }, { headers: H, timeout: 15000 });
  if (r.data.errors) throw new Error(r.data.errors[0].message);
  return r.data.data;
}

async function run() {
  // Verify auth
  var me = await gql('{ me { id email name } }');
  console.log('Authenticated as:', me.me.email);

  // Get all projects + services
  var d = await gql('{ me { projects { edges { node { id name services { edges { node { id name } } } } } } } }');
  var projects = d.me.projects.edges;
  console.log('\nProjects:', projects.length);

  var targetProject = null, targetService = null;
  projects.forEach(function(pe) {
    var p = pe.node;
    console.log('  >> ' + p.name + ' (' + p.id + ')');
    p.services.edges.forEach(function(se) {
      var s = se.node;
      console.log('       Service: ' + s.name + ' (' + s.id + ')');
      if (!targetService) { targetProject = p; targetService = s; }
    });
  });

  if (!targetService) { console.log('No services found'); process.exit(1); }
  console.log('\nUsing: ' + targetProject.name + ' > ' + targetService.name);

  // Get environments
  var d2 = await gql(
    'query($id:String!){ project(id:$id){ environments{ edges{ node{ id name } } } } }',
    { id: targetProject.id }
  );
  var envs = d2.project.environments.edges;
  var env  = envs.find(function(e){ return e.node.name.toLowerCase().includes('prod'); }) || envs[0];
  console.log('Environment:', env.node.name, '(' + env.node.id + ')');

  // Trigger redeploy
  console.log('\nTriggering redeploy...');
  var d3 = await gql(
    'mutation($sid:String!,$eid:String!){ serviceInstanceRedeploy(serviceId:$sid, environmentId:$eid) }',
    { sid: targetService.id, eid: env.node.id }
  );
  console.log('Result:', JSON.stringify(d3));
  console.log('\nRailway is rebuilding. Check in 3 min:');
  console.log('https://opus-command-core-REDACTED.up.railway.app/health');
}

run().catch(function(e){ console.log('ERROR:', e.message); process.exit(1); });
