// (C) 2015 Internet of Coins / Metasync / Joachim de Koning
// hcmd - simple command line interface for hybrixd

// TODO parse help (html into CLI friendly output)
// TODO check if hostname is valid hostname

let waitInterval = 100; // amount of time between each recheck of availibity of process result.
let maxWaitCounter = 800; // max nr of checks before timing out.

// required libraries in this context
let fs = require('fs');
let stdio = require('stdio');
let ini = require('./ini');
let ProgressBar = require('progress');
let bar;

// command line options and init
let ops = stdio.getopt({
  'quiet': {key: 'q', args: 0, description: 'No extra output.'},
  'meta': {key: 'm', args: 0, description: 'Display metadata.'},
  'host': {key: 'h', args: 1, description: 'Set hybrixd host.'},
  'conf': {key: 'c', args: 1, description: 'Provide conf file. hybrixd.conf by default.'},
  '_meta_': {minArgs: 1}
});

let confFile;
if (ops.conf) {
  if (ops.conf.startsWith('/')) {
    confFile = ops.conf;
  } else {
    confFile = '../' + ops.conf;
  }
} else {
  confFile = '../hybrixd.conf';
}

if (fs.existsSync(confFile)) {
  global.hybrixd = ini.parse(fs.readFileSync(confFile, 'utf-8')); // TODO check if file exists
  global.hybrixd.servers = JSON.parse(global.hybrixd.servers);
} else {
  console.log('Error: Configuration file ' + confFile + ' not found.');
}

let http = require('http');

let host, port;
if (ops.host) {
  host = ops.host.split(':')[0];
  port = ops.host.split(':')[1];
} else if (global.hybrixd) {
  for (let endpoint in global.hybrixd.servers) {
    if (global.hybrixd.servers[endpoint] === '/root') {
      let protocolHostport = endpoint.split('://');
      let hostPort = protocolHostport[1].split(':');
      host = hostPort[0];
      port = hostPort[1];
    }
  }
}

function makeProgressBar (processID) {
  bar = new ProgressBar(' [.] process ' + processID + ': [:bar] :percent, eta: :etas', {
    complete: '▓',
    incomplete: '░',
    width: 52,
    total: 100
  });
}

function responder (response, options, waitCounter) {
  if (typeof waitCounter === 'undefined') {
    waitCounter = 0;
  }
  // handle the response
  let rawData = '';

  response.on('data', chunk => { rawData += chunk; });

  response.on('error', () => {
    process.stdout.write('x\n\nError : Connection dropped. Please check if hybrixd is still running.\n\n');
    process.exit(1);
  });

  response.on('end', () => {
    let P;
    try {
      P = JSON.parse(rawData);
    } catch (e) {
      // DEPRECATED: console.log(`Error: JSON Parse failed : ${e}`);
      // return other file types
      console.log(rawData);
      return;
    }

    let id = P.id;
    let progress = P.progress;
    let stopped = typeof P.stopped !== 'undefined' ? P.stopped : null;
    let data = P.data;

    // if we are returned a processID, we fetch that data...
    if (id === 'id') {
      // DEBUG: console.log("[ returning process data for "+data+" ]");
      if (!ops.quiet) {
        makeProgressBar(data);
      }
      setTimeout(function () {
        options.path = `/proc/${data}`;
        let req = http.get(options, function (response) {
          responder(response, options);
        });
        req.on('error', function (err) {
          console.log(`Error: Request failed! ${err.message}`);
        });
      }, waitInterval);
    } else if (progress < 1 && waitCounter < maxWaitCounter && stopped === null && id !== undefined && id !== null && [
      'asset', 'a',
      'engine', 'e',
      'source', 's',
      'command', 'c'
    ].indexOf(id.split('/')[0]) === -1 && options.firstPath.substr(1, 1) !== 'p') {
      waitCounter++;
      if (!ops.quiet) {
        if (typeof bar === 'undefined') { makeProgressBar(id); }
        bar.update(progress);
      }
      setTimeout(function () {
        http.get(options, function (response) {
          responder(response, options, waitCounter);
        });
      }, waitInterval, waitCounter);
    } else {
      if (!ops.quiet) {
        if (typeof bar !== 'undefined') {
          bar.update(1);
        }
        process.stdout.write('\n');
        if (P.error !== 0) {
          process.stdout.write('Error: Process returned an error. [' + P.error + ']\n');
        }
        process.stdout.write('\n');
      }
      if (P.error !== 0 && P.hasOwnProperty('help') && !ops.meta) { // Error occured, non meta
        P.help.split('<br/>').reduce(function (a, b) { console.log(b); }, true);
      } else if (!ops.meta && data) { // Non meta output
        if (options.path.startsWith('/proc/debug/') || options.path.startsWith('/p/debug/')) {
          // Debug output
          const procs = {};
          Object.keys(data).sort().forEach(function (key) {
            procs[key] = data[key];
          });
          for (let pid in procs) {
            let proc = procs[pid];
            let output = pid + ' : ';
            if (proc.err !== 0 && proc.progress) {
              output += '[ERROR @ ' + Math.floor(proc.progress * 100) + '%]';
            } else if (proc.progress !== 1.0 && proc.progress) {
              output += '[UNFINISHED ' + Math.floor(proc.progress * 100) + '%]';
            }
            if (proc.qrtz) {
              if (proc.progress) {
                output += JSON.stringify(proc.qrtz) + ' > ' + JSON.stringify(proc.data);
              } else {
                output += '[NOT STARTED] ' + JSON.stringify(proc.qrtz);
              }
            } else {
              output += 'func ' + proc.path.join('/');
            }
            console.log(output);
          }
        } else if (typeof data === 'string') { // String data output
          console.log(data);
        } else { // Data output
          console.log(JSON.stringify(data));
        }
      } else { // Raw meta output
        console.log(rawData);
      }
      if (waitCounter === maxWaitCounter) {
        console.log('\n\nError: Time out. Process is unfinished!');
      }
      if (!ops.quiet) {
        process.stdout.write('\n');
      }
    }
  });
}

let makeRequest = (paths) => {
  if (paths.length > 0) {
    let options = {
      host: host,
      port: port,
      path: paths[0],
      firstPath: paths[0]
    };

    let req = http.get(options, (response) => {
      responder(response, options);
      paths.shift(); // first element is handled, continue with next.
      makeRequest(paths);
    });
    req.on('error', function (err) {
      console.log(`Error : Request failed : ${err.message}`);
    });
  }
};

if (host && port) {
  makeRequest(ops.args);
} else {
  if (!host) { console.log('Error: Missing hostname.'); }
  if (!port) { console.log('Error: Missing port.'); }
}
