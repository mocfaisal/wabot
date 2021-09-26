const { Client, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatter } = require('./helpers/formatter');
const fileUpload = require('express-fileupload');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
    debug: true
}));

// const server_list = ["@c.us"];

const SESSION_FILE_PATH = './wabot-session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
}

// declare functions

const checkRegsiteredNumber = async function (number) {
    const isRegistered = await client.isRegisteredUser(number);
    return isRegistered;
}


// Initialized

app.get('/', (req, res) => {
    res.sendFile('index.html', { root: __dirname });

    /* res.status(200).json({
        status: true,
        message: 'Node.js jalan euy',
    }); */
});

const client = new Client({
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
}
);


/* On Events */
client.on('message', msg => {
    /*
    Jika chat ke nomor, maka callbacknya disini
    */

    if (msg.body == '!ping') {
        msg.reply('pong');
    } else if (msg.body == 'info') {
        msg.reply("WA-Bot by Mochammad Faisal");
    }
});

client.initialize();

// Socket IO
io.on('connection', function (socket) {
    socket.emit('message', 'Connecting...');

    client.on('qr', (qr) => {
        // Generate and scan this code with your phone
        // console.log('QR RECEIVED', qr);
        qrcode.toDataURL(qr, (err, url) => {
            socket.emit('qr', url);
            socket.emit('message', 'QR Code Received, Please Scan!');
        });
    });

    client.on('ready', () => {
        socket.emit('ready', 'Whatsapp is ready!');
        socket.emit('message', 'Whatsapp is ready!');
        console.log('Whatsapp is ready!');
    });


    client.on('authenticated', (session) => {
        socket.emit('authenticated', 'Whatsapp is authenticated!');
        socket.emit('message', 'Whatsapp is authenticated!');

        // console.log('AUTHENTICATED', session);
        console.log('Whatsapp Authenticated!');

        sessionCfg = session;
        // Save session to file
        fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
            if (err) {
                console.error(err);
            }
        });
    });

});

io.on('disconnect', function (socket) {
    console.log('Client disconnect');
});

/* End Points */

// Send Message
app.post('/send-message', [
    body('number').notEmpty(),
    body('message').notEmpty(),
], async (req, res) => {

    // validation
    const errors = validationResult(req).formatWith(({ msg }) => {
        return msg;
    });

    if (!errors.isEmpty()) {
        return res.status(422).json({
            status: false,
            message: errors.mapped()
        });
    }

    // x-www-form-urlencoded
    // const number = req.body.number + server_list[0];
    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;

    // check number is registered whatsapp or not
    const isRegistered = await checkRegsiteredNumber(number);

    if (!isRegistered) {
        res.status(422).json({
            status: false,
            message: 'Nomor tidak terdaftar Whatsapp',
        });
    }

    client.sendMessage(number, message).then(response => {
        res.status(200).json({
            status: true,
            response: response
        });

        console.log('Message sent!');

    }).catch(err => {
        res.json({
            status: false,
            response: err
        });
    });
});


// Send Media
app.post('/send-media', async (req, res) => {

    // x-www-form-urlencoded
    // const number = req.body.number + server_list[0];
    const number = phoneNumberFormatter(req.body.number);
    const caption = req.body.caption;
    const file_request = req.body.file;

    console.log(req.body);

    let media;
    let file_mimeType;
    let file_data;
    let file_name = 'media';

    // cara 1
    //  media = MessageMedia.fromFilePath('./image-example.jpg');

    // cara 2
    // file_request = req.files.file;
    //  media = new MessageMedia(file_request.mimetype, file_request.data.toString('base64'), file_request.name);

    // cara 3
    file_data = await axios.get(file_request, { responseType: 'arraybuffer' }).then((result) => {
        file_mimeType = result.headers['content-type'];
        return result.data.toString('base64');
    }).catch(err => {
        res.json({
            status: false,
            response: err
        });
    });

    media = new MessageMedia(file_mimeType, file_data, file_name);


    client.sendMessage(number, media, { caption: caption }).then(response => {
        res.status(200).json({
            status: true,
            response: response
        });

        console.log('Message sent!');

    }).catch(err => {
        res.json({
            status: false,
            response: err
        });
    });
});

/* End Points */


// server listen
server.listen(8000, function () {
    console.log('App running on *:', 8000);
});