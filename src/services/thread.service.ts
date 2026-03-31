import {
  ChannelType,
  Message,
  TextChannel,
  ThreadChannel,
  User,
} from 'discord.js';

const AUTO_ARCHIVE_DURATION_MIN = 60;

export class ThreadService {
  async createPrivateThread(
    channel: TextChannel,
    user: User,
    name: string
  ): Promise<ThreadChannel> {
    const thread = await channel.threads.create({
      name,
      type: ChannelType.PrivateThread,
      autoArchiveDuration: AUTO_ARCHIVE_DURATION_MIN,
      invitable: false,
    });

    await thread.members.add(user.id);

    return thread;
  }

  async sendMessage(
    thread: ThreadChannel,
    content: string
  ): Promise<Message> {
    return thread.send(content);
  }

  async closeThread(thread: ThreadChannel): Promise<void> {
    await thread.setArchived(true);
    await thread.setLocked(true);
  }
}
