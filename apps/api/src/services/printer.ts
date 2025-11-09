// apps/api/src/services/printer.ts
import net from 'net';

export type PrintJob = { raw: Buffer };

export interface PrinterDriver {
  print(job: PrintJob): Promise<void>;
}

export class DevNullPrinter implements PrinterDriver {
  async print(job: PrintJob) {
    // Dev printer: do nothing (or log the first bytes)
    console.log(`[Printer] ${job.raw.length} bytes (dev mode)`);
  }
}

export class NetworkEscposPrinter implements PrinterDriver {
  constructor(private host: string, private port: number = 9100, private timeoutMs = 5000) {}
  async print(job: PrintJob): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      let done = false;
      const finish = (err?: any) => {
        if (done) return;
        done = true;
        socket.destroy();
        err ? reject(err) : resolve();
      };
      socket.setTimeout(this.timeoutMs);
      socket.once('error', finish);
      socket.once('timeout', () => finish(new Error('Printer connection timed out')));
      socket.connect(this.port, this.host, () => {
        socket.write(job.raw, (err) => finish(err));
      });
    });
  }
}

export function getPrinterFromEnv(): PrinterDriver {
  const host = process.env.PRINTER_HOST;
  const port = process.env.PRINTER_PORT ? Number(process.env.PRINTER_PORT) : 9100;
  if (host) return new NetworkEscposPrinter(host, port);
  return new DevNullPrinter();
}
