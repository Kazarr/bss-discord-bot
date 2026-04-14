import { ChatInputCommandInteraction, PermissionsBitField } from 'discord.js';

export async function checkAdminPermission(
  interaction: ChatInputCommandInteraction
): Promise<boolean> {
  const member = interaction.member;
  if (!member) {
    return false;
  }

  const permissions = member.permissions;
  if (!(permissions instanceof PermissionsBitField)) {
    return false;
  }

  return permissions.has(PermissionsBitField.Flags.Administrator);
}
