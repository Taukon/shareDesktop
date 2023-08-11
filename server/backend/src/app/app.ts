import https from 'https';
import fs from 'fs';
import express from 'express';
import { networkInterfaces } from "os";
import {
    RtpCodecCapability,
    WebRtcTransportOptions,
    WorkerSettings,
} from 'mediasoup/node/lib/types';
import { Server } from 'socket.io';
import { ServerWebRTC } from "../serverWebRTC";
import { SignalingEventEmitter } from '../signaling/signalingEvent';
import { setSignalingBrowser } from '../signaling/browser';
import { setSignalingDesktop } from '../signaling/desktop';


const getIpAddress = (): string | undefined => {
    const nets = networkInterfaces();
    const net = nets["eth0"]?.find((v) => v.family == "IPv4");
    return net ? net.address : undefined;
}

const MinPort = 2000;   // --- RtcMinPort
const MaxPort = 2020;   // --- RtcMaxport
const limitClient = 2;
const limitDesktop = 2;
const limitFileTransfer = 10;

const clientPort = 3000;  // --- https Port for client
const desktopPort = 3100;  // --- https Port for desktop

const ip_addr = getIpAddress()?? "127.0.0.1"; // --- IP Address

const enableAudio = true;

const transportOption: WebRtcTransportOptions = {
    listenIps: [
        {
            ip: ip_addr
        },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    enableSctp: true,
};

const workerSettings: WorkerSettings = {
    rtcMinPort: MinPort,
    rtcMaxPort: MaxPort,
}

const mediaCodecs: RtpCodecCapability[] = [
    {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
    }
];

// --- HTTPS Server ---
const app: express.Express = express();

app.use(express.static('../public'));

// --- SSL cert for HTTPS access ---
const options = {
    key: fs.readFileSync('../ssl/key.pem', 'utf-8'),
    cert: fs.readFileSync('../ssl/cert.pem', 'utf-8')
}

// --- WebSocket Server For Client ---
const httpsServerForClient = https.createServer(options, app);
httpsServerForClient.listen(clientPort, () => {
    console.log('https://' + ip_addr + ':' + clientPort + '/webRTC_client.html');
});
const clientServer = new Server(httpsServerForClient);

// --- WebSocket Server For Desktop ---
const httpsServerForDesktop = https.createServer(options, app);
httpsServerForDesktop.listen(desktopPort, () => {
    console.log('https://' + ip_addr + ':' + desktopPort + '  <-- desktop server');
});
const desktopServer = new Server(httpsServerForDesktop);

// --- MediaSoup Server ---

const serverWebRtc = new ServerWebRTC(
    limitDesktop,
    limitClient,
    limitFileTransfer,
    transportOption,
    workerSettings,
    mediaCodecs,
    ip_addr
);

const fileEventEmitter = new SignalingEventEmitter(desktopServer);

clientServer.on('connection', sock => {

    setSignalingBrowser(
        clientServer, 
        sock, 
        serverWebRtc, 
        fileEventEmitter, 
        enableAudio
    );
});

desktopServer.on('connection', sock => {

    console.log(`desktopId: ${sock.id}`);
    setSignalingDesktop(
        sock,
        serverWebRtc,
        fileEventEmitter,
        enableAudio
    );
});