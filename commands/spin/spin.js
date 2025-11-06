const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, AttachmentBuilder} = require('discord.js');
const { gifs } = require('../../assets/gifs.json');
const { tenorApiKey } = require('../../config.json');
const path = require('path');

const show_champions_id = "show_champions";
const create_poll_id = "create_poll";

let gif = 0;
let pollActive = false;

function getRandomIndex(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spin')
    .setDescription('does the spin'),
  async execute(interaction) {
    pollActive = false;
    await interaction.reply('https://tenor.com/b0Ot1.gif');

    // pick a random gif object and then a random keyword
    gif = gifs.at(getRandomIndex(gifs.length));
    const keyword = gif.keywords.at(getRandomIndex(gif.keywords.length));

    await new Promise(resolve => setTimeout(resolve, 5000));

    // query Tenor for the keyword
    const res = await fetch(
      `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(keyword)}&key=${tenorApiKey}&limit=1`
    );
    const data = await res.json();
    const resultUrl = data.results?.[0]?.media_formats?.gif?.url;

    // fallback if API fails or returns nothing
    const finalUrl = resultUrl || gif.url;

    const show_champions_button = new ButtonBuilder()
      .setLabel("Show Champions")
      .setCustomId(show_champions_id)
      .setStyle(ButtonStyle.Primary)
    
    const create_poll_button = new ButtonBuilder()
      .setLabel("Pick Roles")
      .setCustomId(create_poll_id)
      .setStyle(ButtonStyle.Primary)

    const actionRow = new ActionRowBuilder()
      .addComponents(create_poll_button)
      .addComponents(show_champions_button);

    const embed = new EmbedBuilder()
      .setColor(gif == 0 ? 0xff0000 : gif.color)
      .setTitle(gif == 0 ? 'ERROR' : gif.name)
      .setImage(finalUrl);

    await interaction.deleteReply()

    const message = await interaction.channel.send({
      embeds: [embed],
      components: [actionRow],
      withResponse: true,
    })
    
    const collector = message.createMessageComponentCollector({
    time: 30000,
    });

    collector.on('collect', async (interactionBtn) => {
      if (interactionBtn.customId === show_champions_id) {
        await interactionBtn.deferUpdate();

        const championsAttachment = new AttachmentBuilder(
          path.join(__dirname, '../../assets/' + (gif == 0 ? 'image0.jpg' : (gif.name + '.png')))
        ).setName('champions.jpg');

        const championsEmbed = new EmbedBuilder()
          .setImage('attachment://champions.jpg')
          .setColor(gif == 0 ? 0xff0000 : gif.color);

        show_champions_button.setDisabled(true);
        await message.edit({
          components: [actionRow],
          embeds: [embed, championsEmbed],
          files: [championsAttachment],
        });
      }

      if (interactionBtn.customId === create_poll_id && pollActive == false) {
        await interactionBtn.deferUpdate();
        pollActive = true;

        create_poll_button.setDisabled(true)
        await message.edit({
          components: [actionRow]
        })
        
        const button_top = new ButtonBuilder()
          .setLabel("Top")
          .setCustomId("top")
          .setStyle(ButtonStyle.Primary);
        const button_jungle = new ButtonBuilder()
          .setLabel("Jungle")
          .setCustomId("jungle")
          .setStyle(ButtonStyle.Primary);
        const button_mid = new ButtonBuilder()
          .setLabel("Mid")
          .setCustomId("mid")
          .setStyle(ButtonStyle.Primary);
        const button_adc = new ButtonBuilder()
          .setLabel("AD Carry")
          .setCustomId("adc")
          .setStyle(ButtonStyle.Primary);
        const button_support = new ButtonBuilder()
          .setLabel("Support")
          .setCustomId("support")
          .setStyle(ButtonStyle.Primary);

        const role_pick_actionRow = new ActionRowBuilder()
          .addComponents(button_top, button_jungle, button_mid, button_adc, button_support);

        const role_pick_message = await interactionBtn.channel.send({
          components: [role_pick_actionRow],
        });

        const roleCollector = role_pick_message.createMessageComponentCollector({
          time: 15000,
        });

        const roles = { top: [], jungle: [], mid: [], adc: [], support: [] };
        const all_users = [];
        roleCollector.on('collect', async (roleInteraction) => {
          await roleInteraction.deferUpdate();
          const user_id = roleInteraction.user.id;
          const role = roleInteraction.customId;
          if(all_users.length <= 5 && !all_users.includes(user_id)){
            all_users.push(user_id);
          }

          if(all_users.includes(user_id)){
            if (!roles[role].includes(user_id)) {
              roles[role].push(user_id);
            }
          }
        });

        roleCollector.on('end', async () => {
          const sorted_roles = Object.entries(roles).sort(
            (a, b) => a[1].length - b[1].length
          );

          const assigned = {};
          const used_users = new Set();

          for (const [role, users] of sorted_roles) {
            if (users.length === 0) {
              assigned[role] = null;
              continue;
            }

            // pick first unused user from list, fallback random
            const available = users.filter(u => !used_users.has(u));
            if (available.length > 0) {
              const randomIndex = getRandomIndex(available.length);
              const chosen = available[randomIndex];
              assigned[role] = chosen;
              used_users.add(chosen);
            }
            else {
              assigned[role] = null;
            }
          }

          // collect all unique users manually
          const tempUsers = {};
          for (const role in roles) {
            for (const u of roles[role]) tempUsers[u] = true;
          }
          const all_users = Object.keys(tempUsers);

          // remaining unassigned users
          const unassigned_users = all_users.filter(u => !used_users.has(u));

          // roles with no one yet
          const empty_roles = [];
          for (const r in assigned) {
            if (!assigned[r]) empty_roles.push(r);
          }

          let i = 0;
          for (const role of empty_roles){
            if (i >= unassigned_users.length){
              break
            };
            assigned[role] = unassigned_users[getRandomIndex(unassigned_users.length)];
            i++;
          }

          const users = {}
          for(const role in assigned){
            if(assigned[role] != null){
              const user = await interaction.guild.members.fetch(assigned[role])
              users[assigned[role]] = user.displayName;
            }
          }

          function escapeMarkdown(text) {
            if (typeof text !== 'string') return String(text ?? '');
            // escape backslash first
            let s = text.replace(/\\/g, '\\\\');
            // escape markdown chars including hyphen
            s = s.replace(/([_*~`|>\-])/g, '\\$1');
            // if it starts with an escaped hyphen or other list-start char, also prefix zero-width-space
            if (/^[\\\-\*\+>\d]/.test(s)) s = '\u200B' + s;
            return s;
          }

          const end_poll_embed = new EmbedBuilder()
          .setTitle("Role Results")
          .setFields(
            {
              name: "Top Lane",
              value: assigned.top ? escapeMarkdown(users[assigned.top]) : "None",
            },
            {
              name: "Jungle",
              value: assigned.jungle ? escapeMarkdown(users[assigned.jungle]) : "None",
            },
            {
              name: "Mid Lane",
              value: assigned.mid ? escapeMarkdown(users[assigned.mid]) : "None",
            },
            {
              name: "AD Carry",
              value: assigned.adc ? escapeMarkdown(users[assigned.adc]) : "None",
            },
            {
              name: "Support",
              value: assigned.support ? escapeMarkdown(users[assigned.support]) : "None",
            }
          )
          .setColor(gif.color);

          await role_pick_message.delete();
          await interaction.channel.send({
            embeds: [end_poll_embed],
          });
        });
      }
    });

    collector.on('end', async () => {
      await message.edit({ components: [],});
    });
  }
}