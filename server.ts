import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { 
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ChannelType, PermissionsBitField
} from "discord.js";
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
  const prefix = "."; // Prefix thay vì Slash Command

  const token = process.env.DISCORD_BOT_TOKEN;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

  // Dữ liệu Game
  const JOBS: Record<string, { name: string, minMoney: number, maxMoney: number }> = {
    'pizza': { name: 'Giao Pizza', minMoney: 150, maxMoney: 300 },
    'miner': { name: 'Thợ Mỏ', minMoney: 250, maxMoney: 450 },
    'taxi': { name: 'Lái Taxi', minMoney: 200, maxMoney: 400 }
  };

  const SHOP_247: Record<string, { name: string, price: number, icon: string, useText: string }> = {
    'bread': { name: 'Bánh Mì', price: 50, icon: '🍞', useText: 'Bạn đã ăn một ổ bánh mì. Thật ngon miệng!' },
    'water': { name: 'Nước Suối', price: 20, icon: '💧', useText: 'Bạn đã uống một ngụm nước suối. Mát lạnh!' },
    'phone': { name: 'Điện Thoại', price: 1500, icon: '📱', useText: 'Bạn lấy điện thoại ra lướt TikTok...' },
  };

  const SHOP_VEHICLES: Record<string, { name: string, price: number, icon: string }> = {
    'bmx': { name: 'Xe Đạp BMX', price: 1000, icon: '🚲' },
    'faggio': { name: 'Xe Máy Faggio', price: 5000, icon: '🛵' },
    'sultan': { name: 'Ô Tô Sultan', price: 50000, icon: '🚗' }
  };

  const SHOP_OOC: Record<string, { name: string, priceCoin: number, icon: string, type: 'vip' | 'vehicle', value?: string }> = {
    'vip_bronze': { name: 'Gói VIP Bronze', priceCoin: 100, icon: '🥉', type: 'vip', value: 'bronze' },
    'vip_gold': { name: 'Gói VIP Gold', priceCoin: 300, icon: '🥇', type: 'vip', value: 'gold' },
    'infernus': { name: 'Siêu Xe Infernus (VIP)', priceCoin: 1000, icon: '🏎️', type: 'vehicle' }
  };

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
  });

  client.once("ready", () => {
    console.log(`Ready! Logged in as ${client.user?.tag}`);
    botStatus = `Connected as ${client.user?.tag}`;
  });

  // Helper check
  async function checkRestrictions(charData: any, message: any): Promise<boolean> {
    if (!charData) {
      await message.reply('❌ Bạn chưa có nhân vật! Dùng `.register <Tên_Họ>` trước.');
      return true;
    }
    if (charData.isCuffed) {
      await message.reply('❌ Bạn đang bị còng tay, không thể thực hiện hành động này!');
      return true;
    }
    if (charData.jailUntil && charData.jailUntil > Date.now()) {
      const timeLeft = Math.ceil((charData.jailUntil - Date.now()) / 60000);
      await message.reply(`❌ Bạn đang ngồi tù! Còn ${timeLeft} phút nữa mới được thả.`);
      return true;
    }
    return false;
  }

  // PREFIX COMMAND HANDLER
  client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    
    if (!command) return;

    try {
      // Bỏ qua database cho các lệnh không cần thiết
      if (command === 'ping') {
        return void message.reply('Pong! 🏓');
      }

      if (command === 'help') {
        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle('📜 Bảng Lệnh SAMP RP')
          .setDescription('Dưới đây là các lệnh bạn có thể sử dụng:')
          .addFields(
            { name: '👤 Cơ bản', value: '`.register <Tên_Họ>`\n`.profile [@user]`\n`.inventory`' },
            { name: '💼 Kinh tế & Tương tác', value: '`.jobs` (Tìm việc)\n`.work` (Làm việc)\n`.pay <@user> <số_tiền>`\n`.give <@user> <mã_vật_phẩm>`\n`.use <mã_vật_phẩm/xe>`' },
            { name: '🛒 Cửa hàng', value: '`.shop` (Cửa hàng 24/7)\n`.vehicles` (Cửa hàng Xe)\n`.shopooc` (Cửa hàng VIP/Coin)' },
            { name: '🎟️ Hỗ trợ (Tickets)', value: '`.ticket` (Tạo kênh hỗ trợ)\n`.close` (Đóng kênh hỗ trợ)' },
            { name: '👮 Faction (LSPD)', value: '`.cuff <@user>`\n`.jail <@user> <phút>`' }
          )
          .setFooter({ text: 'Sử dụng dấu . trước mỗi lệnh' });
        return void message.reply({ embeds: [embed] });
      }

      // HỆ THỐNG TICKET
      if (command === 'ticket') {
        if (!message.guild) return void message.reply('❌ Lệnh này chỉ dùng trong server.');
        const channelName = `ticket-${message.author.username.toLowerCase()}`;
        
        // Kiểm tra xem đã có ticket chưa
        const existingChannel = message.guild.channels.cache.find(c => c.name === channelName);
        if (existingChannel) {
          return void message.reply(`❌ Bạn đã có một kênh hỗ trợ đang mở: <#${existingChannel.id}>`);
        }

        const channel = await message.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: message.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: message.author.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            // Nên add thêm Role Admin ở đây nếu có
          ]
        });

        await channel.send(`Xin chào <@${message.author.id}>, vui lòng trình bày vấn đề của bạn ở đây. Đội ngũ Admin sẽ hỗ trợ sớm nhất.\n\n*(Dùng lệnh \`.close\` để đóng ticket này)*`);
        return void message.reply(`✅ Đã tạo kênh hỗ trợ của bạn tại: <#${channel.id}>`);
      }

      if (command === 'close') {
        if (!message.channel.isTextBased() || !('name' in message.channel) || !(message.channel as any).name.startsWith('ticket-')) {
          return void message.reply('❌ Lệnh này chỉ được dùng trong kênh ticket.');
        }
        await message.reply('Kênh sẽ bị xóa trong 5 giây...');
        setTimeout(() => message.channel.delete().catch(console.error), 5000);
        return;
      }

      // ==== ROLEPLAY COMMANDS ====
      const userRef = db.collection('characters').doc(message.author.id);
      const userDoc = await userRef.get();
      let charData = userDoc.data();

      if (command === 'register') {
        if (charData) return void message.reply('❌ Bạn đã có nhân vật rồi! Dùng `.profile`.');
        const charName = args[0];
        if (!charName || !charName.includes('_')) return void message.reply('❌ Tên không hợp lệ! Vui lòng dùng định dạng Tên_Họ (VD: `.register John_Doe`).');

        await userRef.set({
          name: charName, level: 1, xp: 0, money: 1000, oocCoin: 1000, // Tặng 1000 OOC coin để test shop OOC
          faction: 'Dân thường', vip: null, activeVehicle: null,
          jobId: null, inventory: {}, assets: [], lastWork: 0, isCuffed: false, jailUntil: 0
        });
        return void message.reply(`✅ Đăng ký thành công: **${charName}**. Bạn được tặng **1000 OOC Coins** khởi nghiệp!`);
      }

      // Check auth cho các lệnh dưới
      if (!charData) {
        return void message.reply('❌ Bạn chưa có nhân vật! Dùng `.register <Tên_Họ>` trước.');
      }

      if (command === 'profile') {
        const targetUser = message.mentions.users.first() || message.author;
        const targetDoc = await db.collection('characters').doc(targetUser.id).get();
        const tData = targetDoc.data();
        if (!tData) return void message.reply(`❌ Người chơi này chưa đăng ký.`);

        const jobName = tData.jobId ? JOBS[tData.jobId].name : 'Thất nghiệp';
        const status = tData.jailUntil > Date.now() ? '🔒 Đang ngồi tù' : (tData.isCuffed ? '🔗 Bị còng tay' : '✅ Tự do');
        const vipStatus = tData.vip ? (tData.vip === 'gold' ? '🥇 VIP Gold' : '🥉 VIP Bronze') : 'Không có';
        const currentVehicle = tData.activeVehicle ? (SHOP_VEHICLES[tData.activeVehicle]?.name || SHOP_OOC[tData.activeVehicle]?.name || 'Không xác định') : 'Đi bộ';

        const embed = new EmbedBuilder()
          .setColor(tData.vip ? 0xFFD700 : 0x00FF00) // Màu vàng nếu có VIP
          .setTitle(`👤 Hồ Sơ: ${tData.name}`)
          .addFields(
            { name: 'Cấp độ', value: `Lv.${tData.level || 1} (${tData.xp || 0} XP)`, inline: true },
            { name: 'Tiền mặt', value: `$${tData.money.toLocaleString()}`, inline: true },
            { name: 'OOC Coins', value: `${tData.oocCoin || 0} 🪙`, inline: true },
            { name: 'Tổ chức', value: tData.faction, inline: true },
            { name: 'Nghề nghiệp', value: jobName, inline: true },
            { name: 'Trạng thái', value: status, inline: true },
            { name: 'Đặc quyền', value: vipStatus, inline: true },
            { name: 'Phương tiện đang dùng', value: currentVehicle, inline: true }
          );
        return void message.reply({ embeds: [embed] });
      }

      if (command === 'jobs') {
        if (await checkRestrictions(charData, message)) return;
        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
          .addComponents(new StringSelectMenuBuilder().setCustomId('select_job').setPlaceholder('Chọn công việc...')
            .addOptions(Object.entries(JOBS).map(([id, job]) => 
              new StringSelectMenuOptionBuilder().setLabel(job.name).setDescription(`Lương: $${job.minMoney} - $${job.maxMoney}`).setValue(id)
            )));
        return void message.reply({ content: '🏢 **Trung Tâm Việc Làm**', components: [row] });
      }

      if (command === 'work') {
        if (await checkRestrictions(charData, message)) return;
        if (!charData.jobId || !JOBS[charData.jobId]) return void message.reply('❌ Bạn chưa có việc! Dùng `.jobs`.');

        const now = Date.now();
        const COOLDOWN = 60 * 1000;
        if (now - charData.lastWork < COOLDOWN) {
          return void message.reply(`⏳ Hãy nghỉ ngơi ${Math.ceil((COOLDOWN - (now - charData.lastWork)) / 1000)} giây!`);
        }

        const job = JOBS[charData.jobId];
        let multiplier = 1;
        if (charData.vip === 'bronze') multiplier = 1.5;
        if (charData.vip === 'gold') multiplier = 2;

        const earned = Math.floor((Math.random() * (job.maxMoney - job.minMoney + 1)) + job.minMoney) * multiplier;
        
        let newXp = (charData.xp || 0) + 10;
        let newLevel = charData.level || 1;
        let levelUpMsg = "";
        if (newXp >= newLevel * 100) {
          newLevel++;
          newXp = 0;
          levelUpMsg = `\n🎉 **LEVEL UP!** Bạn đã lên cấp **${newLevel}**!`;
        }

        const vipBonusMsg = multiplier > 1 ? ` (Đã x${multiplier} tiền thưởng VIP)` : '';

        await userRef.update({ money: charData.money + earned, lastWork: now, xp: newXp, level: newLevel });
        return void message.reply(`💼 Bạn làm **${job.name}** và nhận **$${earned}**!${vipBonusMsg} (+10 XP) ${levelUpMsg}`);
      }

      // TÁCH SHOP 24/7, XE, OOC
      if (command === 'shop') {
        if (await checkRestrictions(charData, message)) return;
        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
          .addComponents(new StringSelectMenuBuilder().setCustomId('buy_247').setPlaceholder('Chọn mặt hàng sinh hoạt...')
            .addOptions(Object.entries(SHOP_247).map(([id, item]) => 
              new StringSelectMenuOptionBuilder().setLabel(`${item.icon} ${item.name}`).setDescription(`Giá: $${item.price.toLocaleString()}`).setValue(id)
            )));
        return void message.reply({ content: '🏪 **Cửa Hàng 24/7** (Sinh hoạt & Nhu yếu phẩm)', components: [row] });
      }

      if (command === 'vehicles') {
        if (await checkRestrictions(charData, message)) return;
        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
          .addComponents(new StringSelectMenuBuilder().setCustomId('buy_vehicle').setPlaceholder('Chọn xe muốn mua...')
            .addOptions(Object.entries(SHOP_VEHICLES).map(([id, item]) => 
              new StringSelectMenuOptionBuilder().setLabel(`${item.icon} ${item.name}`).setDescription(`Giá: $${item.price.toLocaleString()}`).setValue(id)
            )));
        return void message.reply({ content: '🚗 **Showroom Xe Cộ** (Bằng tiền In-game)', components: [row] });
      }

      if (command === 'shopooc') {
        if (await checkRestrictions(charData, message)) return;
        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
          .addComponents(new StringSelectMenuBuilder().setCustomId('buy_ooc').setPlaceholder('Mua Gói VIP & Xe Độc Quyền...')
            .addOptions(Object.entries(SHOP_OOC).map(([id, item]) => 
              new StringSelectMenuOptionBuilder().setLabel(`${item.icon} ${item.name}`).setDescription(`Giá: ${item.priceCoin} 🪙 OOC Coins`).setValue(id)
            )));
        return void message.reply({ content: '💎 **Cửa Hàng OOC (Nạp Thẻ)**\n*(Số Coins của bạn: '* + (charData.oocCoin || 0) + '* 🪙)*', components: [row] });
      }

      if (command === 'inventory') {
        const items = charData.inventory || {};
        const assets = charData.assets || [];
        let desc = "**Túi đồ (In-game):**\n";
        let hasItems = false;
        for (const [id, count] of Object.entries(items)) {
          if (SHOP_247[id] && count > 0) {
            desc += `Mã: \`${id}\` - ${SHOP_247[id].icon} ${SHOP_247[id].name}: **${count}**\n`;
            hasItems = true;
          }
        }
        if (!hasItems) desc += "Không có gì.\n";

        desc += "\n**Kho Xe Cộ (Dùng lệnh \`.use <mã_xe>\`):**\n";
        if (assets.length === 0) desc += "Chưa có chiếc xe nào.\n";
        assets.forEach((aId: string) => {
          const v = SHOP_VEHICLES[aId] || SHOP_OOC[aId];
          if (v) desc += `Mã: \`${aId}\` - ${v.icon} ${v.name} ${charData.activeVehicle === aId ? '(Đang lái)' : ''}\n`;
        });

        const embed = new EmbedBuilder().setColor(0x8A2BE2).setTitle(`🎒 Túi Đồ Của ${charData.name}`).setDescription(desc);
        return void message.reply({ embeds: [embed] });
      }

      // TÍNH NĂNG TƯƠNG TÁC NGƯỜI CHƠI
      if (command === 'use') {
        if (await checkRestrictions(charData, message)) return;
        const targetId = args[0];
        if (!targetId) return void message.reply('❌ Bạn chưa nhập mã vật phẩm/xe (VD: `.use bread` hoặc `.use sultan`).');

        // Check xem có phải là Xe không
        if (charData.assets && charData.assets.includes(targetId)) {
          await userRef.update({ activeVehicle: targetId });
          const v = SHOP_VEHICLES[targetId] || SHOP_OOC[targetId];
          return void message.reply(`🚗 Bạn đã lấy **${v.name}** ra sử dụng!`);
        }

        // Check xem có phải Vật Phẩm Túi đồ không
        if (charData.inventory && charData.inventory[targetId] > 0) {
          const inv = charData.inventory;
          inv[targetId] -= 1;
          await userRef.update({ inventory: inv });
          const useMsg = SHOP_247[targetId]?.useText || `Bạn đã sử dụng ${SHOP_247[targetId]?.name}`;
          return void message.reply(`✅ ${useMsg} *(Còn lại: ${inv[targetId]})*`);
        }

        return void message.reply('❌ Bạn không sở hữu vật phẩm/xe này!');
      }

      if (command === 'pay' || command === 'give') {
        if (await checkRestrictions(charData, message)) return;
        const target = message.mentions.users.first();
        if (!target) return void message.reply('❌ Bạn cần tag người nhận (VD: `.pay @User 100`).');
        if (target.id === message.author.id) return void message.reply('❌ Không thể giao dịch với chính mình.');
        
        const tRef = db.collection('characters').doc(target.id);
        const tDoc = await tRef.get();
        if (!tDoc.exists) return void message.reply('❌ Người nhận chưa đăng ký nhân vật!');

        if (command === 'pay') {
          const amount = parseInt(args[1]);
          if (isNaN(amount) || amount <= 0) return void message.reply('❌ Số tiền không hợp lệ.');
          if (charData.money < amount) return void message.reply('❌ Bạn không đủ tiền!');

          await db.runTransaction(async (t) => {
            const s = await t.get(userRef);
            const r = await t.get(tRef);
            t.update(userRef, { money: s.data()!.money - amount });
            t.update(tRef, { money: r.data()!.money + amount });
          });
          return void message.reply(`💸 Bạn đã chuyển **$${amount.toLocaleString()}** cho <@${target.id}>.`);
        }

        if (command === 'give') {
          const itemId = args[1];
          const qty = parseInt(args[2]) || 1;
          if (!itemId || !SHOP_247[itemId]) return void message.reply('❌ Vật phẩm không hợp lệ.');
          if (qty <= 0) return void message.reply('❌ Số lượng không hợp lệ.');
          
          const inv = charData.inventory || {};
          if ((inv[itemId] || 0) < qty) return void message.reply('❌ Bạn không có đủ vật phẩm này trong túi.');

          await db.runTransaction(async (t) => {
            const s = await t.get(userRef);
            const r = await t.get(tRef);
            const sInv = s.data()!.inventory || {};
            const rInv = r.data()!.inventory || {};
            
            sInv[itemId] -= qty;
            rInv[itemId] = (rInv[itemId] || 0) + qty;
            
            t.update(userRef, { inventory: sInv });
            t.update(tRef, { inventory: rInv });
          });
          return void message.reply(`📦 Bạn đã đưa **${qty}x ${SHOP_247[itemId].name}** cho <@${target.id}>.`);
        }
      }

    } catch (error) {
      console.error('Lỗi khi xử lý lệnh:', error);
      message.reply('❌ Đã xảy ra lỗi hệ thống!').catch(console.error);
    }
  });

  // INTERACTION HANDLER (Cho các Menu thả xuống)
  client.on('interactionCreate', async interaction => {
    try {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferReply({ ephemeral: true });
      
      const val = interaction.values[0];
      const userRef = db.collection('characters').doc(interaction.user.id);
      const userDoc = await userRef.get();
      const charData = userDoc.data();

      if (!charData) return void interaction.editReply('❌ Bạn chưa có nhân vật!');

      if (interaction.customId === 'select_job') {
        await userRef.update({ jobId: val });
        return void interaction.editReply(`✅ Đã nhận việc thành công! Dùng \`.work\` để làm việc.`);
      } 
      
      if (interaction.customId === 'buy_247' || interaction.customId === 'buy_vehicle') {
        const isVehicle = interaction.customId === 'buy_vehicle';
        const itemInfo = isVehicle ? SHOP_VEHICLES[val] : SHOP_247[val];
        
        if (!itemInfo) return void interaction.editReply('❌ Mục không hợp lệ.');
        if (charData.money < itemInfo.price) return void interaction.editReply(`❌ Thiếu tiền! Giá là $${itemInfo.price.toLocaleString()}`);

        if (isVehicle) {
          const assets = charData.assets || [];
          if (assets.includes(val)) return void interaction.editReply('❌ Bạn đã sở hữu xe này rồi!');
          assets.push(val);
          await userRef.update({ money: charData.money - itemInfo.price, assets });
        } else {
          const inventory = charData.inventory || {};
          inventory[val] = (inventory[val] || 0) + 1;
          await userRef.update({ money: charData.money - itemInfo.price, inventory });
        }
        return void interaction.editReply(`✅ Đã mua thành công **${itemInfo.name}**!`);
      }

      if (interaction.customId === 'buy_ooc') {
        const itemInfo = SHOP_OOC[val];
        if (!itemInfo) return void interaction.editReply('❌ Gói VIP/Xe OOC không hợp lệ.');
        if ((charData.oocCoin || 0) < itemInfo.priceCoin) return void interaction.editReply(`❌ Bạn không đủ OOC Coins! Cần ${itemInfo.priceCoin} 🪙`);

        if (itemInfo.type === 'vip') {
          await userRef.update({ oocCoin: charData.oocCoin - itemInfo.priceCoin, vip: itemInfo.value });
        } else if (itemInfo.type === 'vehicle') {
          const assets = charData.assets || [];
          if (assets.includes(val)) return void interaction.editReply('❌ Bạn đã có xe VIP này rồi!');
          assets.push(val);
          await userRef.update({ oocCoin: charData.oocCoin - itemInfo.priceCoin, assets });
        }
        return void interaction.editReply(`💎 Mua thành công OOC: **${itemInfo.name}**! (VIP tăng thưởng khi đi làm)`);
      }

    } catch (error) {
      console.error('Error handling interaction:', error);
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({ content: '❌ Lỗi hệ thống Menu.', ephemeral: true }).catch(console.error);
      }
    }
  });

  // GitHub Webhook Endpoint
  app.post('/api/github-webhook', (req, res) => {
    try {
      const event = req.headers['x-github-event'];
      if (event === 'ping') return void res.status(200).send('Pong!');

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
                .setURL(payload.compare || null)
                .setAuthor({
                  name: payload.sender?.login || 'GitHub',
                  iconURL: payload.sender?.avatar_url || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
                  url: payload.sender?.html_url || null
                });

              let description = '';
              commits.forEach((commit: any) => {
                const shortHash = commit.id.substring(0, 7);
                description += `[\`${shortHash}\`](${commit.url}) ${commit.message} - ${commit.author.name}\n`;
              });

              embed.setDescription(description.substring(0, 4000));
              channel.send({ embeds: [embed] }).catch(console.error);
            }
          }
        }
      }
      res.status(200).send('Webhook received');
    } catch (error) {
      res.status(500).send(`Internal Server Error: ${(error as any).message}`);
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
    res.json({ status: botStatus, connected: client.isReady() });
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
