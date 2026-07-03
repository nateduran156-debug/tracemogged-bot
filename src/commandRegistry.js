import * as register from './commands/register.js';
import * as raidscan from './commands/raidscan.js';
import * as promorole from './commands/promorole.js';
import * as channels from './commands/channels.js';
import * as activity from './commands/activity.js';
import * as profile from './commands/profile.js';
import * as whitelistCmd from './commands/whitelist.js';
import * as ticketpanel from './commands/ticketpanel.js';
import * as verify from './commands/verify.js';
import * as vetting from './commands/vetting.js';
import * as boostprotect from './commands/boostprotect.js';
import * as backup from './commands/backup.js';
import * as lookup from './commands/lookup.js';

export const slashCommandData = [
  register.data,
  raidscan.data,
  raidscan.groupScanData,
  raidscan.addAttendeeData,
  promorole.addData,
  promorole.removeData,
  promorole.listData,
  channels.setLogChannelData,
  channels.setMissedChannelData,
  channels.setGateChannelData,
  channels.closeTicketData,
  channels.setTranscriptChannelData,
  activity.activityCheckData,
  activity.kickNonreactorsData,
  profile.profileData,
  profile.profileAllData,
  whitelistCmd.whitelistData,
  ticketpanel.ticketPanelData,
  verify.data,
  vetting.data,
  boostprotect.data,
  backup.backupData,
  backup.restoreData,
  lookup.data,
];

export { register, raidscan, promorole, channels, activity, profile, whitelistCmd, ticketpanel, verify, vetting, boostprotect, backup, lookup };
