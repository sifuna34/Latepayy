const express = require('express');
const path = require('path');

const app = express();
app.use(express.text({ type: '*/*', limit: '1mb' }));

// Runs a Netlify-style function (netlify/functions/<name>.js)
async function runFunction(req, res) {
  const name = req.params.name;
  if (!/^[a-z0-9_-]+$/i.test(name)) return res.status(404).json({ error: 'Not found' });

  let mod;
  try {
    mod = require('./netlify/functions/' + name + '.js');
  } catch (e) {
    console.error('Could not load function', name, e.message);
    return res.status(404).json({ error: 'Not found' });
  }

  const event = {
    httpMethod: req.method,
    headers: req.headers,
    body: typeof req.body === 'string' ? req.body : '',
    queryStringParameters: req.query,
    path: req.path
  };

  try {
    const result = await mod.handler(event, {});
    res.status(result.statusCode || 200);
    Object.entries(result.headers || {}).forEach(([k, v]) => res.set(k, v));
    res.send(result.body || '');
  } catch (e) {
    console.error('Function error', name, e);
    res.status(500).json({ error: 'Server error.' });
  }
}

app.all(['/.netlify/functions/:name', '/api/:name'], runFunction);

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Listening on ' + port));
