declare module 'nodemailer' {
  export interface TransportOptions {
    service?: string;
    auth: {
      user: string;
      pass: string;
    };
  }

  export interface Transporter {
    sendMail(options: any): Promise<any>;
  }

  export function createTransport(options: TransportOptions): Transporter;
}
