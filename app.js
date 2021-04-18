const options = {
    cors: {
        origin: '*',
        // origin: "http://101.50.0.39:3001",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
};
const { Client, MessageMedia, Location } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');

const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatter } = require('./numFormat');
// const fileUpload = require('express-fileupload');
// const axios = require('axios');
const port = 8007;

const app = express();
const server = http.createServer(app);
const io = socketIO(server, options);

var dateTime = require('node-datetime');

var lineReader = require('line-reader');

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.use(cors());

// app.use(fileUpload({
//   debug: true
// }));

function isEmptyObject(obj) {
  return !Object.keys(obj).length;
}

const SESSION_FILE_PATH = './whatsapp-session.json';
let sessionCfg;
let isLogin;
if (fs.existsSync(SESSION_FILE_PATH)) {
  sessionCfg = require(SESSION_FILE_PATH);
  isLogin = true;
}

app.get('/', (req, res) => {
  res.send({ response: "I am alive" }).status(200);
});

const client = new Client({
  restartOnAuthFail: true,
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // <- this one doesn't works in Windows
      '--disable-gpu'
    ],
  },
  session: sessionCfg
});

client.initialize();

client.on('message',  (msg) => {

  fs.readFile('savePhone.log', 'utf8' , async (err, data) => {

    if (err) {
      console.error(err)
      return
    }

    var dataPhone = data.split(/\r?\n/);

    var i;
    for (i = 0; i < dataPhone.length; i++) {

      if ( dataPhone[i].length > 10 ) {

        const numbs = dataPhone[i].replace(/[^0-9.]/g, '')
        const number = phoneNumberFormatter( numbs );
        const isRegisteredNumber = await checkRegisteredNumber(number);

        if ( isRegisteredNumber ) {

          listMsg   = '*You have msg from :*'
                      + '\n\nhttps://wa.me/' + msg.from.replace(/[^0-9.]/g, '')
                      + '\n\n*msg :*\n\n' + msg.body
                      + '\n\n*Location :*\n\n' + msg.reply(new Location(37.422, -122.084, 'Googleplex\nGoogle Headquarters'));;

          client.sendMessage(number, listMsg).then(response => {
            console.log( "success", number, listMsg )
          }).catch(err => {
            console.log( "error", number )
          });

        }

        await delay(10000);

      }

    }

  })

});

// Socket IO
io.on('connection', function(socket) {

  socket.emit('connecting', ( isLogin ? 'isLogin' : 'connecting' ));

  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    isLogin = false;
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit('qr', url);
    });
  });

  client.on('ready', () => {
    console.log('READY', "ready");
    isLogin = true;
    socket.emit('ready', 'Whatsapp is ready!');
    // io.emit('message', 'Whatsapp is ready!');
  });

  client.on('authenticated', (session) => {
    isLogin = true;
    socket.emit('authenticated', 'Whatsapp is authenticated!');
    // io.emit('message', 'Whatsapp is authenticated!');
    console.log('AUTHENTICATED', session);
    sessionCfg = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function(err) {
      if (err) {
        console.error(err);
      }
    });
  });

  client.on('auth_failure', function(session) {
    console.log('auth_failure', "Auth failure, restarting");
    isLogin = false;
    socket.emit('connecting', 'connecting');

    if (fs.existsSync(SESSION_FILE_PATH)) {
      fs.unlinkSync(SESSION_FILE_PATH, function(err) {
          if(err) return console.log(err);
          console.log('Session file deleted!');
      });
    }

  });

  client.on('disconnected',  (reason) => {
     console.log( "reason" )
  });

  client.on ('change_state', (change_state) => {
    console.log ('WhatsApp: Device', change_state);

    // if ( change_state === "OPENING" ) {

      // try {
      //   console.log ('IF WhatsApp: Device', change_state);
      //   isLogin = false;
      //   socket.emit('connecting', 'connecting');
      //   fs.unlinkSync(SESSION_FILE_PATH, function(err) {
      //       if(err) return console.log(err);
      //       console.log('Session file deleted!');
      //   });
      //   client.destroy();
      //   client.initialize();

    //   } catch (error) {
    //     console.log('That did not go well.')
    //   }
    //
    //
    // }

  });

});

const checkRegisteredNumber = async function(number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
}

function delay(t, val) {
   return new Promise(function(resolve) {
       setTimeout(function() {
           resolve(val);
       }, t);
   });
}

app.post('/remover', async (req, res) => {

  if ( !isEmptyObject( req.body.phoneBc ) ) {

    const numbs = req.body.phoneBc

    fs.readFile('savePhone.log', 'utf8' , (err, data) => {

      if (err) {
        console.error(err)
        return
      }

      var dataPhone = data.split(/\r?\n/);

      if ( dataPhone.indexOf( numbs ) >= 0 ) {

        let dataArray = data.split('\n');

        for (let i = 0; i < dataArray.length; i++) {
            if (dataArray[i].trim() === numbs) {
                dataArray.splice(i, 1);
            }
        }

        const updatedData = dataArray.join('\n');

        fs.writeFile('savePhone.log', updatedData, (err) => {
            if (err) throw err;
            console.log('Successfully updated the file!');
        });

      }

      fs.readFile('savePhone.log', 'utf8' , (err, data) => {

        if (err) {
          console.error(err)
          return
        }

        var dataPhone = data.split(/\r?\n/);
        res.send({ response: dataPhone }).status(200);

      })

    })

  }

});

app.post('/forwarder', async (req, res) => {

  if ( !isEmptyObject( req.body.phoneBc ) ) {

    var listPhoneBc = req.body.phoneBc.split(",");

    var i;
    for (i = 0; i < listPhoneBc.length; i++) {

      const numbs = listPhoneBc[i].replace(/[^0-9.]/g, '')
      const number = phoneNumberFormatter( numbs );
      const isRegisteredNumber = await checkRegisteredNumber(number);
      const log = fs.createWriteStream('savePhone.log', { flags: 'a' });

      if ( isRegisteredNumber ) {

        fs.readFile('savePhone.log', 'utf8' , (err, data) => {

          if (err) {
            console.error(err)
            return
          }

          var dataPhone = data.split(/\r?\n/);

          if ( dataPhone.indexOf( numbs ) < 0 ) {

            log.write( numbs + '\n');
            log.end();

          }

        })

      }

    }

  }

  fs.readFile('savePhone.log', 'utf8' , (err, data) => {

    if (err) {
      console.error(err)
      return
    }

    var dataPhone = data.split(/\r?\n/);
    res.send({ response: dataPhone }).status(200);

  })

});

app.post('/broadcast', async (req, res) => {

  if ( !isEmptyObject( req.body.phoneBc ) && !isEmptyObject( req.body.msgBc ) ) {

    var listPhoneBc = req.body.phoneBc.split(",");
    var listMsg     = req.body.msgBc;

    var i;
    for (i = 0; i < listPhoneBc.length; i++) {

      const numbs = listPhoneBc[i].replace(/[^0-9.]/g, '')
      const number = phoneNumberFormatter( numbs );
      const isRegisteredNumber = await checkRegisteredNumber(number);

      var dt = dateTime.create();
      var formatted = dt.format('Y-m-d H:M:S');

      if ( isRegisteredNumber ) {

        client.sendMessage(number, listMsg).then(response => {
          io.emit('tables', { status: 'success', phone: numbs, msg: listMsg, time: formatted });
          console.log( "success", number, listMsg )
        }).catch(err => {
          io.emit('tables', { status: 'failed', phone: numbs, msg: listMsg, time: formatted });
          console.log( "error", number, listMsg )
        });

      } else {
        io.emit('tables', { status: 'error', phone: numbs, msg: listMsg, time: formatted });
        console.log( "failed", number, listMsg )
      }

      if (i + 1 === listPhoneBc.length) {
        io.emit('isSending', 'no');
      } else {
        io.emit('isSending', 'yes');
      }

      await delay(10000);

    }

  }

  res.sendStatus(200);

});

const findGroupByName = async function(name) {
  const group = await client.getChats().then(chats => {
    return chats.find(chat =>
      chat.isGroup && chat.name.toLowerCase() == name.toLowerCase()
    );
  });
  return group;
}

server.listen(port, '0.0.0.0', function() {
  console.log('App running on *: ' + port);
});
