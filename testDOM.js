const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require("fs");

const html = fs.readFileSync('public/index.html', 'utf8');

const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", url: "http://localhost/" });
const window = dom.window;

window.addEventListener('error', event => {
  console.error("DOM ERROR:", event.error);
});

// Since we cannot easily run socket.io-client inside JSDOM through file paths, we'll mock it
window.io = function() {
  return {
    on: function() {},
    emit: function() {},
    id: "socket123"
  };
};

const domScripts = [
  'public/js/ui.js',
  'public/js/game.js',
  'public/js/socket.js',
  'public/js/app.js'
];

domScripts.forEach(scriptPath => {
  const code = fs.readFileSync(scriptPath, 'utf8');
  try {
    window.eval(code);
  } catch (err) {
    console.error("Script error in " + scriptPath + ":", err);
  }
});

setTimeout(() => {
  console.log("Scripts loaded.");
  try {
     window.Socket.on('whot-round-started', null); // fake trigger?
     // We can just trigger the callback directly if we grab it.
  } catch (err) {
     console.error("Runtime error:", err);
  }
  process.exit(0);
}, 1000);
