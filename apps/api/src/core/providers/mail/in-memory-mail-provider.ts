import { IMailProvider, MailMessage } from "./mail-provider.js";

/**
 * Collects messages instead of sending them, so a test can assert on what would
 * have been delivered — including digging the verification link back out of the
 * body, which is the only way to test the flow end to end without a mailbox.
 */
export class InMemoryMailProvider implements IMailProvider {
  public readonly sent: MailMessage[] = [];

  /**
   * Set to make the next `send` reject. Registration must survive a mail
   * outage, and the only way to prove that is to cause one.
   */
  public failNextSend: Error | null = null;

  async send(message: MailMessage): Promise<void> {
    if (this.failNextSend) {
      const error = this.failNextSend;
      this.failNextSend = null;
      throw error;
    }

    this.sent.push(message);
  }

  lastMessage(): MailMessage | null {
    return this.sent[this.sent.length - 1] ?? null;
  }

  clear(): void {
    this.sent.length = 0;
    this.failNextSend = null;
  }
}
