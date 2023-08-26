import { networkInterfaces } from "os";
import { exec } from "child_process";
import { BrowserWindow, desktopCapturer, ipcMain } from "electron";
import { screenshot, converter, xtest } from "./x11lib";
import { Xvfb } from "./xvfb";
import { AppProcess } from "./appProcess";
import { AudioData, ControlData, DisplayInfo } from "../../util/type";
import { FileShare } from "./fileShare";
import { setXkbLayout } from "./xkbmap";
import { Uim } from "./IM/uim";
import { Fcitx5 } from "./IM/fcitx5";
import { Ibus } from "./IM/ibus";

export const initIpcHandler = (mainWindow: BrowserWindow): void => {
  ipcMain.handle("getDisplayInfo", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["window", "screen"],
    });
    const info: DisplayInfo[] = [];
    for (const source of sources) {
      info.push({ name: source.name, id: source.id });
    }
    return info;
  });

  ipcMain.handle(
    "testControl",
    (
      event: Electron.IpcMainInvokeEvent,
      displayName: string,
      data: ControlData,
    ) => {
      if (data.move?.x != undefined && data.move?.y != undefined) {
        try {
          //console.log("try: "+data.move.x +" :"+ data.move.y);
          xtest.testMotionEvent(displayName, data.move.x, data.move.y);
        } catch (error) {
          console.error(error);
        }
      } else if (
        data.button?.buttonMask != undefined &&
        data.button.down != undefined
      ) {
        try {
          //console.log("try: " + data.button.buttonMask + " : " + data.button.down);
          xtest.testButtonEvent(
            displayName,
            data.button.buttonMask,
            data.button.down,
          );
        } catch (error) {
          console.error(error);
        }
      } else if (data.key?.keySim != undefined && data.key.down != undefined) {
        try {
          //console.log("try: " + data.key.keySim + " : " + data.key.down);
          xtest.testKeyEvent(displayName, data.key.keySim, data.key.down);
        } catch (error) {
          console.error(error);
        }
      }
    },
  );

  ipcMain.handle(
    "getScreenshot",
    (event: Electron.IpcMainInvokeEvent, displayName: string) => {
      try {
        const img = screenshot.screenshot(displayName);
        const [width, height, depth, fb_bpp] =
          screenshot.getScreenInfo(displayName);
        if (width && height && depth && fb_bpp) {
          const imgJpeg = converter.convert(img, width, height, depth, fb_bpp);
          return imgJpeg;
        }
      } catch (err) {
        console.log(err);
        return undefined;
      }
    },
  );

  ipcMain.handle(
    "getFullScreenshot",
    (event: Electron.IpcMainInvokeEvent, displayName: string) => {
      try {
        const img = screenshot.screenshotFull(displayName);
        const [width, height, depth, fb_bpp] =
          screenshot.getFullScreenInfo(displayName);
        if (width && height && depth && fb_bpp) {
          const imgJpeg = converter.convert(img, width, height, depth, fb_bpp);
          return imgJpeg;
        }
      } catch (err) {
        console.log(err);
        return undefined;
      }
    },
  );

  ipcMain.handle(
    "setXkbLayout",
    (
      event: Electron.IpcMainInvokeEvent,
      displayNum: number,
      layout: string,
    ) => {
      const process = setXkbLayout(displayNum, layout);
      if (process) {
        return true;
      }

      return false;
    },
  );

  //let im: Uim | Fcitx5 | Ibus | undefined;
  let imRun = false;
  ipcMain.handle(
    "setInputMethod",
    (event: Electron.IpcMainInvokeEvent, displayNum: number) => {
      if (imRun) {
        return false;
      }

      if (process.env.XMODIFIERS === `@im=uim`) {
        const im = new Uim(displayNum);
        imRun = im.isRun();
      } else if (process.env.XMODIFIERS === `@im=ibus`) {
        const im = new Ibus(displayNum);
        imRun = im.isRun();
      } else if (process.env.XMODIFIERS === `@im=fcitx`) {
        const im = new Fcitx5(displayNum);
        imRun = im.isRun();
      }

      if (imRun) {
        return true;
      }

      return false;
    },
  );

  let xvfb: Xvfb | undefined;
  ipcMain.handle(
    "startXvfb",
    (
      event: Electron.IpcMainInvokeEvent,
      displayNum: number,
      x?: number,
      y?: number,
    ) => {
      xvfb = new Xvfb(displayNum, {
        width: x && x > 0 ? x : 1200,
        height: y && y > 0 ? y : 720,
        depth: 24,
      });
      if (xvfb.start()) {
        return true;
      }
      return false;
    },
  );

  ipcMain.handle(
    "startApp",
    (
      event: Electron.IpcMainInvokeEvent,
      displayNum: number,
      appPath: string,
    ) => {
      if (xvfb) {
        const appProcess = new AppProcess(displayNum, appPath, []);

        process.on("exit", (e) => {
          console.log(`exit: ${e}`);
          appProcess.stop();
          xvfb?.stop();
        });

        process.on("SIGINT", (e) => {
          console.log(`SIGINT: ${e}`);
          // appProcess.stop();
          // xvfb.stop();
          process.exit(0);
        });
        process.on("uncaughtException", (e) => {
          console.log(`uncaughtException: ${e}`);
          appProcess.stop();
          xvfb?.stop();
        });

        return true;
      }
      return false;
    },
  );

  ipcMain.handle(
    "getAudio",
    (
      event: Electron.IpcMainInvokeEvent,
      pulseAudioDevice: number,
      data: AudioData,
    ) => {
      let command: string | undefined = undefined;

      if (data.ip_addr && data.rtp && !data.rtcp && !data.srtpParameters) {
        command = `ffmpeg -f pulse -i ${pulseAudioDevice} -map 0:a:0 -acodec libopus -ab 128k -ac 2 -ar 48000 -ssrc 11111111 -payload_type 101 -f rtp rtp://${data.ip_addr}:${data.rtp}`;
      } else if (
        data.ip_addr &&
        data.rtp &&
        data.rtcp &&
        !data.srtpParameters
      ) {
        command = `ffmpeg -f pulse -i ${pulseAudioDevice} -map 0:a:0 -acodec libopus -ab 128k -ac 2 -ar 48000 -ssrc 11111111 -payload_type 101 -f rtp rtp://${data.ip_addr}:${data.rtp}?rtcpport=${data.rtcp}`;
      } else if (
        data.ip_addr &&
        data.rtp &&
        !data.rtcp &&
        data.srtpParameters
      ) {
        command = `ffmpeg -f pulse -i ${pulseAudioDevice} -map 0:a:0 -acodec libopus -ab 128k -ac 2 -ar 48000 -ssrc 11111111 -payload_type 101 -f rtp -srtp_out_suite ${data.srtpParameters.cryptoSuite} -srtp_out_params ${data.srtpParameters.keyBase64} srtp://${data.ip_addr}:${data.rtp}`;
      } else if (data.ip_addr && data.rtp && data.rtcp && data.srtpParameters) {
        command = `ffmpeg -f pulse -i ${pulseAudioDevice} -map 0:a:0 -acodec libopus -ab 128k -ac 2 -ar 48000 -ssrc 11111111 -payload_type 101 -f rtp -srtp_out_suite ${data.srtpParameters.cryptoSuite} -srtp_out_params ${data.srtpParameters.keyBase64} srtp://${data.ip_addr}:${data.rtp}?rtcpport=${data.rtcp}`;
      }

      if (command) {
        //console.log(command);
        return exec(command).pid;
      }
      return undefined;
    },
  );

  ipcMain.handle(
    "stopAudio",
    (event: Electron.IpcMainInvokeEvent, ffmpegPid: number) => {
      try {
        process.kill(ffmpegPid + 1);
        process.kill(ffmpegPid);
        console.log(
          "delete ffmpeg process Id: " + ffmpegPid + ", " + (ffmpegPid + 1),
        );
      } catch (error) {
        console.log(error);
      }
    },
  );

  const fileShare = new FileShare();

  ipcMain.handle(
    "getFileInfo",
    async (event: Electron.IpcMainInvokeEvent, fileName: string) => {
      return fileShare.getFileInfo(fileName);
    },
  );

  ipcMain.handle(
    "sendFileBuffer",
    async (
      event: Electron.IpcMainInvokeEvent,
      fileName: string,
      fileTransferId: string,
    ) => {
      return await fileShare.sendStreamFile(
        fileName,
        fileTransferId,
        mainWindow,
      );
    },
  );

  ipcMain.handle(
    "setFileInfo",
    async (
      event: Electron.IpcMainInvokeEvent,
      fileName: string,
      fileSize: number,
    ) => {
      return fileShare.setFileInfo(fileName, fileSize);
    },
  );

  ipcMain.handle(
    "recvFileBuffer",
    async (
      event: Electron.IpcMainInvokeEvent,
      fileName: string,
      buffer: Uint8Array,
    ) => {
      return fileShare.recvStreamFile(fileName, buffer, mainWindow);
    },
  );

  ipcMain.handle(
    "destroyRecvFileBuffer",
    async (event: Electron.IpcMainInvokeEvent, fileName: string) => {
      return fileShare.destroyRecvStreamFile(fileName);
    },
  );

  ipcMain.handle(
    "initFileWatch",
    (event: Electron.IpcMainInvokeEvent, dirPath: string) => {
      if (fileShare.initFileWatch(dirPath)) {
        return fileShare.sendFilechange(mainWindow);
      }
      return false;
    },
  );

  ipcMain.handle(
    "sendFileWatch",
    (event: Electron.IpcMainInvokeEvent, dirPath: string) => {
      return fileShare.sendFilelist(mainWindow, dirPath);
    },
  );

  ipcMain.handle("getAddress", () => {
    const ip_addr = getIpAddress() ?? "127.0.0.1"; // --- IP Address
    return ip_addr;
  });

  ipcMain.handle("getBasePath", () => {
    return `${__dirname}`;
  });
};

const getIpAddress = (): string | undefined => {
  const nets = networkInterfaces();
  const net = nets["eth0"]?.find((v) => v.family == "IPv4");
  return net ? net.address : undefined;
};
