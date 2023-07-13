import { io, Socket } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

import { Chrome111 } from 'mediasoup-client/lib/handlers/Chrome111.js';

// import { ChildProcess, exec } from "child_process";
import { Buffer } from 'buffer';
// @ts-ignore
window.Buffer = Buffer;


export class DesktopRtc {
    public desktopId: string;
    public sock: Socket;

    private displayName: string;
    private interval: number;
    private intervalId?: NodeJS.Timer;

    private preImg = Buffer.alloc(0);   // --- Screen Image Buffer jpeg 
    // private ffmpegPS?: ChildProcess;   // ---ffmpeg process
    // // --- for ffmpeg
    // private pulseAudioDevice = 1;
    // // --- end ffmpeg


    private msDevice?: mediasoupClient.types.Device;
    private msControlTransport?: mediasoupClient.types.Transport;
    private msScreenTransport?: mediasoupClient.types.Transport;

    constructor(displayNum: number, desktopId: string, socket: Socket, interval: number){
        this.displayName = `:${displayNum}`;

        this.desktopId = desktopId;
        this.sock = socket;
        this.interval = interval;
    }

    public async initDesktop(): Promise<void> {
        await this.createDevice();

        this.msControlTransport = await this.createControlTransport();
        this.msScreenTransport = await this.createScreenTransport();

        // this.getAudio();
        this.getControl();
        this.sendScreen();
        //this.sendFullScreen();
    }

    public async initDesktopNoAudio(): Promise<void> {
        await this.createDevice();

        this.msControlTransport = await this.createControlTransport();
        this.msScreenTransport = await this.createScreenTransport();

        this.getControl();
        await this.sendScreen();
        //this.sendFullScreen();
    }

    public deleteDesktop(): void {
        // if (this.ffmpegPS?.pid) {
        //     try {
        //         const pid = this.ffmpegPS.pid;
        //         process.kill(pid + 1);
        //         process.kill(pid);
        //         console.log("delete ffmpeg process Id: " + pid + ", " + (pid + 1));
        //     } catch (error) {
        //         console.log(error);
        //     }
        // }

        console.log("disconnect clear intervalId: " + this.intervalId);
        clearInterval(this.intervalId);
    }

    private async createDevice(): Promise<void> {
        const rtpCap: mediasoupClient.types.RtpCapabilities = await this.sendRequest('getRtpCapabilities', this.desktopId);
        //console.log(rtpCap);
        const device = new mediasoupClient.Device({handlerFactory: Chrome111.createFactory()});
        await device.load({ routerRtpCapabilities: rtpCap });
        this.msDevice = device;
    }

    // --- Producer ---

    private async createScreenTransport(): Promise<mediasoupClient.types.Transport | undefined> {
        if (this.msDevice) {
            const params = await this.sendRequest('createDesktopScreen', this.desktopId);
            const transport = this.msDevice.createSendTransport(params);

            transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                this.sendRequest('connectDesktopScreen', {
                    desktopId: this.desktopId,
                    dtlsParameters: dtlsParameters,
                }).then(callback)
                    .catch(errback);
            });

            transport.on('producedata', async (parameters, callback, errback) => {
                try {
                    const id = await this.sendRequest('establishDesktopScreen', {
                        desktopId: this.desktopId,
                        produceParameters: parameters,
                    });
                    callback({ id: id });
                } catch (err: any) {
                    errback(err);
                }
            });

            transport.observer.on('close', () => {
                transport.close();
            });

            return transport;
        }
        return undefined;
    }

    // --- Cousumer ---

    private async createControlTransport(): Promise<mediasoupClient.types.Transport | undefined> {
        if (this.msDevice) {
            const params = await this.sendRequest('createDesktopControl', this.desktopId);
            const transport = this.msDevice.createRecvTransport(params);

            transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                this.sendRequest('connectDesktopControl', {
                    desktopId: this.desktopId,
                    dtlsParameters: dtlsParameters
                }).then(callback)
                    .catch(errback);
            });

            transport.observer.on('close', () => {
                transport.close();
            });

            return transport;
        }
        return undefined;
    }

    // ----- screen ----------
    private async sendScreen(): Promise<void> {
        if(this.msScreenTransport){

            const producer = await this.msScreenTransport.produceData({ordered: false, maxRetransmits: 0});

            if(producer.readyState === "open") {
                // console.log(`producer.readyState: ${producer.readyState}`);
                this.intervalId = setInterval(async () => {
                    try {
                        const img = await window.api.getScreenshot(this.displayName);
                        if(img){
                            if (Buffer.compare(img, this.preImg) != 0) {
                                producer.send(img);
                                this.preImg = Buffer.from(img.buffer);
                            }
                        }
                    }catch(err){
                        console.log(err);
                    }
              
                }, this.interval);
            }else{
                console.log(`producer.readyState: ${producer.readyState}`);
                producer.on('open', () => {
                    this.intervalId = setInterval(async () => {
                        try {
                            const img = await window.api.getScreenshot(this.displayName);
                            if(img){
                                if (Buffer.compare(img, this.preImg) != 0) {
                                    producer.send(img);
                                    this.preImg = Buffer.from(img.buffer);
                                }
                            }
                        }catch(err){
                            console.log(err);
                        }
                  
                    }, this.interval);
                });
            }
        }
    }

    public async sendFullScreen(): Promise<void> {
        if(this.msScreenTransport){

            const producer = await this.msScreenTransport.produceData();
          
            if(producer.readyState === "open") {
                // console.log(`producer.readyState: ${producer.readyState}`);
                this.intervalId = setInterval(async () => {
                    try {
                        const img = await window.api.getFullScreenshot(this.displayName);
                        if(img){
                            if (Buffer.compare(img, this.preImg) != 0) {
                                producer.send(img);
                                this.preImg = Buffer.from(img.buffer);
                            }
                        }
                    }catch(err){
                        console.log(err);
                    }
              
                }, this.interval);
            }else{
                console.log(`producer.readyState: ${producer.readyState}`);
                producer.on('open', () => {
                    this.intervalId = setInterval(async () => {
                        try {
                            const img = await window.api.getFullScreenshot(this.displayName);
                            if(img){
                                if (Buffer.compare(img, this.preImg) != 0) {
                                    producer.send(img);
                                    this.preImg = Buffer.from(img.buffer);
                                }
                            }
                        }catch(err){
                            console.log(err);
                        }
                  
                    }, this.interval);
                });
            }
        }
    }

    // ----- keyboard ----------
    private async getControl(): Promise<void> {
        if (this.msControlTransport) {
            const params = await this.sendRequest('establishDesktopControl', this.desktopId);
            const consumer = await this.msControlTransport.consumeData(params);

            consumer.on('message', msg => {
                const buf = Buffer.from(msg as ArrayBuffer);
                const data: {
                    move?: {
                        x: number|undefined,
                        y: number|undefined,
                    },
                    button?: {
                        buttonMask: number|undefined,
                        down: boolean|undefined
                    },
                    key?: {
                        keySim: number|undefined,
                        down: boolean|undefined
                    }
                } = JSON.parse(buf.toString());
                //console.log(data);

                window.api.testControl(this.displayName, data);
            });
        }
    }

    // ----------- audio -------------
    // private async getAudio(): Promise<void> {
    //     const params = await this.sendRequest('establishDesktopAudio', this.desktopId);
    //     if(params){
    //         // const buf = Buffer.from(data as ArrayBuffer);
    //         // const msg = JSON.parse(buf.toString());
    //         const msg = params;
    //         console.log(msg);

    //         let command: string|undefined = undefined;

    //         if (msg.ip_addr && msg.rtp && !(msg.rtcp) && !(msg.srtpParameters)){
    //         command = `ffmpeg -f pulse -i ${this.pulseAudioDevice} -map 0:a:0 -acodec libopus -ab 128k -ac 2 -ar 48000 -ssrc 11111111 -payload_type 101 -f rtp rtp://${msg.ip_addr}:${msg.rtp}`;

    //         } else if (msg.ip_addr && msg.rtp && msg.rtcp && !(msg.srtpParameters)) {
    //             command = `ffmpeg -f pulse -i ${this.pulseAudioDevice} -map 0:a:0 -acodec libopus -ab 128k -ac 2 -ar 48000 -ssrc 11111111 -payload_type 101 -f rtp rtp://${msg.ip_addr}:${msg.rtp}?rtcpport=${msg.rtcp}`;

    //         } else if (msg.ip_addr && msg.rtp && !(msg.rtcp) && msg.srtpParameters) {
    //             command = `ffmpeg -f pulse -i ${this.pulseAudioDevice} -map 0:a:0 -acodec libopus -ab 128k -ac 2 -ar 48000 -ssrc 11111111 -payload_type 101 -f rtp -srtp_out_suite ${msg.srtpParameters.cryptoSuite} -srtp_out_params ${msg.srtpParameters.keyBase64} srtp://${msg.ip_addr}:${msg.rtp}`;

    //         } else if (msg.ip_addr && msg.rtp && msg.rtcp && msg.srtpParameters){
    //             command = `ffmpeg -f pulse -i ${this.pulseAudioDevice} -map 0:a:0 -acodec libopus -ab 128k -ac 2 -ar 48000 -ssrc 11111111 -payload_type 101 -f rtp -srtp_out_suite ${msg.srtpParameters.cryptoSuite} -srtp_out_params ${msg.srtpParameters.keyBase64} srtp://${msg.ip_addr}:${msg.rtp}?rtcpport=${msg.rtcp}`;
    //         }

    //         if(command){
    //             //console.log(command);
    //             this.ffmpegPS = exec(command);
    //         }
    //     }
    // }


    // ---------- common use ----------

    private async sendRequest(type: string, data: any): Promise<any> {
        return new Promise((resolve) => {
            this.sock.emit(type, data, (res: any) => resolve(res));
        });
    }  
}