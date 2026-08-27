import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import { GoogleGenAI } from "@google/genai";
import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin
if (!getApps().length) {
  initializeApp({
    credential: applicationDefault()
  });
}
const db = getFirestore();

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  let botStatus = "Disconnected";

  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID || "1151423042363338782"; 
  const geminiApiKey = process.env.GEMINI_API_KEY;

  const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

  const JOBS: Record<string, { name: string, minMoney: number, maxMoney: number }> = {
    'pizza': { name: 'Giao Pizza', minMoney: 150, maxMoney: 300 },
    'miner': { name: 'Thợ Mỏ', minMoney: 250, maxMoney: 450 },
    'taxi': { name: 'Lái Taxi', minMoney: 200, maxMoney: 400 }
  };

  const SHOP: Record<string, { name: string, price: number, icon: string }> = {
    'bread': { name: 'Bánh Mì', price: 50, icon: '🍞' },
    'water': { name: 'Nước Suối', price: 20, icon: '💧' },
    'phone': { name: 'Điện Thoại', price: 1500, icon: '📱' },
  };

  const ASSETS: Record<string, { name: string, price: number, icon: string, type: 'vehicle' | 'house' }> = {
    'bmx': { name: 'Xe Đạp BMX', price: 1000, icon: '🚲', type: 'vehicle' },
    'faggio': { name: 'Xe Máy Faggio', price: 5000, icon: '🛵', type: 'vehicle' },
    'sultan': { name: 'Ô Tô Sultan', price: 50000, icon: '🚗', type: 'vehicle' },
    'motel': { name: 'Phòng Trọ', price: 20000, icon: '🚪', type: 'house' },
    'villa': { name: 'Biệt Thự', price: 500000, icon: '🏠', type: 'house' }
  };

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
  });

  const commands = [
    { name: 'ping', description: 'Kiểm tra kết nối của bot' },
    { name: 'server_info', description: 'Xem thông tin máy chủ SAMP RP' },
    {
      name: 'register',
      description: 'Đăng ký nhân vật RP',
      options: [{ name: 'character_name', type: 3, description: 'Tên nhân vật (VD: John_Doe)', required: true }]
    },
    {
      name: 'profile',
      description: 'Xem hồ sơ nhân vật',
      options: [{ name: 'user', type: 6, description: 'Người chơi', required: false }]
    },
    { name: 'jobs', description: 'Mở trung tâm việc làm' },
    { name: 'work', description: 'Đi làm kiếm tiền & XP' },
    { name: 'shop', description: 'Mua vật phẩm sinh hoạt' },
    { name: 'realestate', description: 'Mua nhà và xe cộ (Tài sản)' },
    { name: 'inventory', description: 'Xem túi đồ và tài sản' },
    {
      name: 'pay',
      description: 'Chuyển tiền cho người khác',
      options: [
        { name: 'user', type: 6, description: 'Người nhận', required: true },
        { name: 'amount', type: 4, description: 'Số tiền', required: true }
      ]
    },
    {
      name: 'setfaction',
      description: '[ADMIN] Đặt faction cho người chơi',
      options: [
        { name: 'user', type: 6, description: 'Người chơi', required: true },
        { 
          name: 'faction', type: 3, description: 'Tổ chức', required: true,
          choices: [
            { name: 'Dân thường', value: 'Dân thường' },
            { name: 'LSPD', value: 'LSPD' },
            { name: 'EMS', value: 'EMS' }
          ]
        }
      ]
    },
    {
      name: 'cuff',
      description: '[LSPD] Còng tay / tháo còng người chơi',
      options: [{ name: 'user', type: 6, description: 'Kẻ tình nghi', required: true }]
    },
    {
      name: 'jail',
      description: '[LSPD] Bỏ tù người chơi',
      options: [
        { name: 'user', type: 6, description: 'Phạm nhân', required: true },
        { name: 'minutes', type: 4, description: 'Số phút ngồi tù', required: true }
      ]
    },
    {
      name: 'ticket',
      description: '[LSPD] Phạt tiền người chơi',
      options: [
        { name: 'user', type: 6, description: 'Người vi phạm', required: true },
        { name: 'amount', type: 4, description: 'Số tiền phạt', required: true }
      ]
    },
    {
      name: 'heal',
      description: '[EMS] Chữa trị cho người chơi',
      options: [{ name: 'user', type: 6, description: 'Bệnh nhân', required: true }]
    },
    {
      name: 'talk',
      description: 'Nói chuyện với NPC (AI)',
      options: [
        { 
          name: 'npc', type: 3, description: 'Chọn NPC', required: true,
          choices: [
            { name: 'Cảnh Sát', value: 'cop' },
            { name: 'Ông Chủ', value: 'boss' },
            { name: 'Bác Sĩ', value: 'doctor' }
          ]
        },
        { name: 'message', type: 3, description: 'Câu nói của bạn', required: true }
      ]
    }
  ];

  client.once("ready", async () => {
    console.log(`Ready! Logged in as ${client.user?.tag}`);
    botStatus = `Connected as ${client.user?.tag}`;

    if (token && guildId && client.user) {
      const rest = new REST({ version: '10' }).setToken(token);
      try {
        await rest.put(
          Routes.applicationGuildCommands(client.user.id, guildId),
          { body: commands },
        );
      } catch (error: any) {
        console.error('Error registering commands:', error);
      }
    }
  });

  // Helper function to check restrictions (cuffed, jailed)
  async function checkRestrictions(charData: any, interaction: any): Promise<boolean> {
    if (!charData) {
      await interaction.editReply('❌ Bạn chưa có nhân vật! Dùng `/register` trước.');
      return true;
    }
    if (charData.isCuffed) {
      await interaction.editReply('❌ Bạn đang bị còng tay, không thể thực hiện hành động này!');
      return true;
    }
    if (charData.jailUntil && charData.jailUntil > Date.now()) {
      const timeLeft = Math.ceil((charData.jailUntil - Date.now()) / 60000);
      await interaction.editReply(`❌ Bạn đang ngồi tù! Còn ${timeLeft} phút nữa mới được thả.`);
      return true;
    }
    return false;
  }

  client.on('interactionCreate', async interaction => {
    try {
      if (interaction.isChatInputCommand()) {
        
        // Fast paths that don't need user data
        if (interaction.commandName === 'ping') {
          return await interaction.reply('Pong! 🏓');
        } 
        if (interaction.commandName === 'server_info') {
          const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🌍 Thông Tin Máy Chủ SAMP RP')
            .addFields(
              { name: '📍 IP Máy Chủ', value: '`samp.maychu-rp.com:7777`', inline: true },
              { name: '👥 Người Chơi Online', value: '142/500', inline: true }
            );
          return await interaction.reply({ embeds: [embed] });
        }

        await interaction.deferReply();
        
        const userRef = db.collection('characters').doc(interaction.user.id);
        const userDoc = await userRef.get();
        const charData = userDoc.data();

        if (interaction.commandName === 'register') {
          if (charData) return await interaction.editReply('❌ Bạn đã có nhân vật rồi!');
          const charName = interaction.options.getString('character_name');
          if (!charName || !charName.includes('_')) return await interaction.editReply('❌ Tên không hợp lệ! Vui lòng dùng định dạng Tên_Họ (VD: John_Doe).');

          await userRef.set({
            name: charName, level: 1, xp: 0, money: 1000, faction: 'Dân thường',
            jobId: null, inventory: {}, assets: [], lastWork: 0, isCuffed: false, jailUntil: 0
          });
          return await interaction.editReply(`✅ Đăng ký thành công nhân vật: **${charName}**.`);
        }

        // Require character from here on
        if (!charData) {
          return await interaction.editReply('❌ Bạn chưa có nhân vật! Dùng `/register` trước.');
        }

        if (interaction.commandName === 'profile') {
          const targetUser = interaction.options.getUser('user') || interaction.user;
          const targetDoc = await db.collection('characters').doc(targetUser.id).get();
          const tData = targetDoc.data();
          if (!tData) return await interaction.editReply(`❌ Người chơi này chưa đăng ký.`);

          const jobName = tData.jobId ? JOBS[tData.jobId].name : 'Thất nghiệp';
          const status = tData.jailUntil > Date.now() ? '🔒 Đang ngồi tù' : (tData.isCuffed ? '🔗 Bị còng tay' : '✅ Tự do');

          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`👤 Hồ Sơ: ${tData.name}`)
            .addFields(
              { name: 'Cấp độ', value: `Lv.${tData.level || 1} (${tData.xp || 0} XP)`, inline: true },
              { name: 'Tiền mặt', value: `$${tData.money.toLocaleString()}`, inline: true },
              { name: 'Tổ chức', value: tData.faction, inline: true },
              { name: 'Nghề nghiệp', value: jobName, inline: true },
              { name: 'Trạng thái', value: status, inline: true }
            );
          return await interaction.editReply({ embeds: [embed] });
        }

        if (interaction.commandName === 'jobs') {
          if (await checkRestrictions(charData, interaction)) return;
          const row = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(new StringSelectMenuBuilder().setCustomId('select_job').setPlaceholder('Chọn công việc...')
              .addOptions(Object.entries(JOBS).map(([id, job]) => 
                new StringSelectMenuOptionBuilder().setLabel(job.name).setDescription(`Lương: $${job.minMoney} - $${job.maxMoney}`).setValue(id)
              )));
          return await interaction.editReply({ content: '🏢 **Trung Tâm Việc Làm**', components: [row] });
        }

        if (interaction.commandName === 'work') {
          if (await checkRestrictions(charData, interaction)) return;
          if (!charData.jobId || !JOBS[charData.jobId]) return await interaction.editReply('❌ Bạn chưa có việc! Dùng `/jobs`.');

          const now = Date.now();
          const COOLDOWN = 60 * 1000;
          if (now - charData.lastWork < COOLDOWN) {
            return await interaction.editReply(`⏳ Hãy nghỉ ngơi ${Math.ceil((COOLDOWN - (now - charData.lastWork)) / 1000)} giây!`);
          }

          const job = JOBS[charData.jobId];
          const earned = Math.floor(Math.random() * (job.maxMoney - job.minMoney + 1)) + job.minMoney;
          
          let newXp = (charData.xp || 0) + 10;
          let newLevel = charData.level || 1;
          let levelUpMsg = "";
          if (newXp >= newLevel * 100) {
            newLevel++;
            newXp = 0;
            levelUpMsg = `\n🎉 **LEVEL UP!** Bạn đã lên cấp **${newLevel}**!`;
          }

          await userRef.update({ money: charData.money + earned, lastWork: now, xp: newXp, level: newLevel });
          return await interaction.editReply(`💼 Bạn làm **${job.name}** và nhận **$${earned}**! (+10 XP) ${levelUpMsg}`);
        }

        if (interaction.commandName === 'shop' || interaction.commandName === 'realestate') {
          if (await checkRestrictions(charData, interaction)) return;
          const isRealEstate = interaction.commandName === 'realestate';
          const items = isRealEstate ? ASSETS : SHOP;
          
          const row = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(new StringSelectMenuBuilder().setCustomId(isRealEstate ? 'buy_asset' : 'buy_item').setPlaceholder('Chọn mục muốn mua...')
              .addOptions(Object.entries(items).map(([id, item]) => 
                new StringSelectMenuOptionBuilder().setLabel(`${item.icon} ${item.name}`).setDescription(`Giá: $${item.price.toLocaleString()}`).setValue(id)
              )));
          return await interaction.editReply({ content: isRealEstate ? '🏘️ **Trung Tâm Bất Động Sản & Showroom Xe**' : '🏪 **Cửa Hàng 24/7**', components: [row] });
        }

        if (interaction.commandName === 'inventory') {
          const items = charData.inventory || {};
          const assets = charData.assets || [];
          let desc = "**Túi đồ:**\n";
          let hasItems = false;
          for (const [id, count] of Object.entries(items)) {
            if (SHOP[id] && count > 0) {
              desc += `${SHOP[id].icon} ${SHOP[id].name}: **${count}**\n`;
              hasItems = true;
            }
          }
          if (!hasItems) desc += "Không có gì.\n";

          desc += "\n**Tài sản (Nhà/Xe):**\n";
          if (assets.length === 0) desc += "Chưa sở hữu tài sản nào.\n";
          assets.forEach((aId: string) => {
            if (ASSETS[aId]) desc += `${ASSETS[aId].icon} ${ASSETS[aId].name}\n`;
          });

          const embed = new EmbedBuilder().setColor(0x8A2BE2).setTitle(`🎒 Túi Đồ Của ${charData.name}`).setDescription(desc);
          return await interaction.editReply({ embeds: [embed] });
        }

        if (interaction.commandName === 'pay') {
          if (await checkRestrictions(charData, interaction)) return;
          const target = interaction.options.getUser('user');
          const amount = interaction.options.getInteger('amount');
          
          if (!target || !amount || amount <= 0) return await interaction.editReply('❌ Số tiền không hợp lệ.');
          if (target.id === interaction.user.id) return await interaction.editReply('❌ Không thể tự chuyển cho mình.');
          if (charData.money < amount) return await interaction.editReply('❌ Bạn không đủ tiền!');

          const tRef = db.collection('characters').doc(target.id);
          const tDoc = await tRef.get();
          if (!tDoc.exists) return await interaction.editReply('❌ Người nhận chưa đăng ký nhân vật!');

          await db.runTransaction(async (t) => {
            const senderDoc = await t.get(userRef);
            const receiverDoc = await t.get(tRef);
            t.update(userRef, { money: senderDoc.data()!.money - amount });
            t.update(tRef, { money: receiverDoc.data()!.money + amount });
          });

          return await interaction.editReply(`💸 Bạn đã chuyển **$${amount.toLocaleString()}** cho <@${target.id}>.`);
        }

        // === FACTION COMMANDS ===
        if (interaction.commandName === 'setfaction') {
          // Require Administrator Discord permission
          if (!interaction.memberPermissions?.has('Administrator')) {
            return await interaction.editReply('❌ Bạn không có quyền Administrator để dùng lệnh này!');
          }
          const target = interaction.options.getUser('user');
          const faction = interaction.options.getString('faction');
          const tRef = db.collection('characters').doc(target!.id);
          if (!(await tRef.get()).exists) return await interaction.editReply('❌ Người chơi chưa đăng ký!');
          
          await tRef.update({ faction });
          return await interaction.editReply(`✅ Đã set faction của <@${target!.id}> thành **${faction}**.`);
        }

        if (['cuff', 'jail', 'ticket'].includes(interaction.commandName)) {
          if (await checkRestrictions(charData, interaction)) return;
          if (charData.faction !== 'LSPD') return await interaction.editReply('❌ Bạn không phải là Cảnh Sát (LSPD)!');
          const target = interaction.options.getUser('user');
          const tRef = db.collection('characters').doc(target!.id);
          const tDoc = await tRef.get();
          if (!tDoc.exists) return await interaction.editReply('❌ Tội phạm chưa đăng ký!');

          if (interaction.commandName === 'cuff') {
            const isCuffed = !tDoc.data()!.isCuffed;
            await tRef.update({ isCuffed });
            return await interaction.editReply(`🔗 Bạn đã **${isCuffed ? 'Còng tay' : 'Tháo còng'}** <@${target!.id}>.`);
          }
          if (interaction.commandName === 'jail') {
            const mins = interaction.options.getInteger('minutes') || 1;
            await tRef.update({ jailUntil: Date.now() + mins * 60000, isCuffed: false });
            return await interaction.editReply(`🚔 Đã tống giam <@${target!.id}> trong **${mins} phút**.`);
          }
          if (interaction.commandName === 'ticket') {
            const amount = interaction.options.getInteger('amount') || 0;
            await tRef.update({ money: Math.max(0, tDoc.data()!.money - amount) });
            return await interaction.editReply(`📝 Đã ghi biên lai phạt **$${amount.toLocaleString()}** cho <@${target!.id}>.`);
          }
        }

        if (interaction.commandName === 'heal') {
          if (await checkRestrictions(charData, interaction)) return;
          if (charData.faction !== 'EMS') return await interaction.editReply('❌ Bạn không phải là Bác Sĩ (EMS)!');
          const target = interaction.options.getUser('user');
          return await interaction.editReply(`💉 Bạn đã sơ cứu và chữa trị cho <@${target!.id}> thành công.`);
        }

        // === AI NPC TALK ===
        if (interaction.commandName === 'talk') {
          if (!ai) return await interaction.editReply('❌ Tính năng AI chưa được cấu hình.');
          const npc = interaction.options.getString('npc');
          const message = interaction.options.getString('message');
          
          const npcPrompts: Record<string, string> = {
            'cop': 'Bạn là một sĩ quan cảnh sát LSPD. Lạnh lùng, nghiêm khắc.',
            'boss': 'Bạn là ông chủ trung tâm việc làm. Keo kiệt, hay càu nhàu, hối thúc nhân viên làm việc.',
            'doctor': 'Bạn là bác sĩ tại bệnh viện EMS. Ân cần, tốt bụng, khuyên giữ sức khỏe.'
          };

          try {
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: `${npcPrompts[npc!]}\n\nNgười chơi nói: "${message}"`,
            });
            return await interaction.editReply(`🗣️ **NPC ${npc}**: ${response.text}`);
          } catch(e) {
            return await interaction.editReply('❌ NPC đang bận, không thể trả lời.');
          }
        }
      } 
      else if (interaction.isStringSelectMenu()) {
        await interaction.deferReply({ ephemeral: true });
        const val = interaction.values[0];
        const userRef = db.collection('characters').doc(interaction.user.id);
        const userDoc = await userRef.get();
        const charData = userDoc.data();

        if (await checkRestrictions(charData, interaction)) return;

        if (interaction.customId === 'select_job') {
          await userRef.update({ jobId: val });
          return await interaction.editReply(`✅ Đã nhận việc thành công! Dùng \`/work\` để làm việc.`);
        } 
        
        if (interaction.customId === 'buy_item' || interaction.customId === 'buy_asset') {
          const isAsset = interaction.customId === 'buy_asset';
          const itemInfo = isAsset ? ASSETS[val] : SHOP[val];
          
          if (!itemInfo) return await interaction.editReply('❌ Mặt hàng không hợp lệ.');
          if (charData.money < itemInfo.price) return await interaction.editReply(`❌ Thiếu tiền! Giá là $${itemInfo.price.toLocaleString()}`);

          if (isAsset) {
            const assets = charData.assets || [];
            if (assets.includes(val)) return await interaction.editReply('❌ Bạn đã sở hữu tài sản này rồi!');
            assets.push(val);
            await userRef.update({ money: charData.money - itemInfo.price, assets });
          } else {
            const inventory = charData.inventory || {};
            inventory[val] = (inventory[val] || 0) + 1;
            await userRef.update({ money: charData.money - itemInfo.price, inventory });
          }
          return await interaction.editReply(`✅ Đã mua **${itemInfo.name}**!`);
        }
      }
    } catch (error) {
      console.error('Error handling interaction:', error);
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({ content: '❌ Đã xảy ra lỗi hệ thống.', ephemeral: true }).catch(console.error);
      }
    }
  });

  if (token) {
    client.login(token).catch(err => {
      console.error("Failed to login to Discord:", err);
      botStatus = "Error logging in: " + err.message;
    });
  } else {
    botStatus = "Missing DISCORD_BOT_TOKEN";
  }

  app.get("/api/bot-status", (req, res) => {
    res.json({ status: botStatus, connected: client.isReady(), hasGuildId: !!guildId });
  });

  // GitHub Webhook Endpoint
  app.post('/api/github-webhook', (req, res) => {
    try {
      const event = req.headers['x-github-event'];
      
      if (event === 'ping') {
        res.status(200).send('Pong!');
        return;
      }

      if (event === 'push') {
        const payload = req.body;
        const updateChannelId = process.env.DISCORD_UPDATE_CHANNEL_ID;

        if (updateChannelId && client.isReady()) {
          const channel = client.channels.cache.get(updateChannelId);
          if (channel && channel.isTextBased()) {
            const commits = payload.commits || [];
            if (commits.length > 0) {
              const embed = new EmbedBuilder()
                .setColor(0x2b3137)
                .setTitle(`[${payload.repository?.name || 'Repository'}] ${commits.length} new commit(s) pushed`)
                .setURL(payload.compare || '')
                .setAuthor({
                  name: payload.sender?.login || 'GitHub',
                  iconURL: payload.sender?.avatar_url || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
                  url: payload.sender?.html_url || ''
                });

              let description = '';
              commits.forEach((commit: any) => {
                const shortHash = commit.id.substring(0, 7);
                description += `[\`${shortHash}\`](${commit.url}) ${commit.message} - ${commit.author.name}\n`;
              });

              embed.setDescription(description.substring(0, 4000));
              channel.send({ embeds: [embed] }).catch(console.error);
            }
          } else {
            console.warn(`Channel ${updateChannelId} not found or not text-based.`);
          }
        }
      }

      res.status(200).send('Webhook received');
    } catch (error) {
      console.error('Error handling webhook:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
