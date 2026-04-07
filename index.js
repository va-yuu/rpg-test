const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');

const TOKEN  = process.env.DISCORD_TOKEN  || 'token-here';
const APP_ID = process.env.DISCORD_APP_ID || 'id-here';

const db = {
  players:  new Map(),
  duels:    new Map(),
  auctions: new Map(),
};

const CLASSES = {
  warrior: { name: 'Guerrier', hp: 120, atk: 15, def: 10, mana: 30,  emoji: '\u2694\uFE0F' },
  mage:    { name: 'Mage',     hp: 80,  atk: 25, def: 5,  mana: 100, emoji: '\uD83D\uDD2E' },
  rogue:   { name: 'Voleur',   hp: 100, atk: 20, def: 7,  mana: 50,  emoji: '\uD83D\uDDE1\uFE0F' },
  paladin: { name: 'Paladin',  hp: 110, atk: 12, def: 15, mana: 60,  emoji: '\uD83D\uDEE1\uFE0F' },
};

const MONSTERS = [
  { name: 'Goblin',       emoji: '\uD83D\uDC7A', hp: 30,  atk: 5,  def: 2,  xp: 20,  gold: 10  },
  { name: 'Loup Sombre',  emoji: '\uD83D\uDC3A', hp: 50,  atk: 10, def: 4,  xp: 40,  gold: 20  },
  { name: 'Troll',        emoji: '\uD83D\uDC79', hp: 80,  atk: 15, def: 8,  xp: 70,  gold: 35  },
  { name: 'Dragon',       emoji: '\uD83D\uDC09', hp: 120, atk: 22, def: 12, xp: 120, gold: 60  },
  { name: 'Demon Ancien', emoji: '\uD83D\uDE08', hp: 200, atk: 35, def: 18, xp: 250, gold: 120 },
];

const QUESTS = [
  {
    id: 'q1', name: 'La Foret Maudite', emoji: '\uD83C\uDF32',
    description: 'Des creatures etranges rodent dans la foret au nord du village.',
    difficulty: 'Facile', reward: { xp: 50, gold: 30 },
    objective: 'Eliminez 3 Goblins', type: 'kill', target: 'Goblin', count: 3,
  },
  {
    id: 'q2', name: 'Le Tresor Perdu', emoji: '\uD83D\uDC8E',
    description: 'Un marchand offre une recompense pour retrouver sa cargaison dans les ruines.',
    difficulty: 'Moyen', reward: { xp: 120, gold: 80 },
    objective: 'Terminez 2 donjons', type: 'dungeon', count: 2,
  },
  {
    id: 'q3', name: 'La Porte des Enfers', emoji: '\uD83D\uDD25',
    description: 'Un portail demoniaque s\'est ouvert. Seul un heros intrepide peut le fermer.',
    difficulty: 'Legendaire', reward: { xp: 500, gold: 300 },
    objective: 'Vainquez le Demon Ancien', type: 'kill', target: 'Demon Ancien', count: 1,
  },
];

const SHOP_ITEMS = [
  { id: 'sword_iron',   name: 'Epee en Fer',     price: 50,  atk: 5,  def: 0, hp: 0  },
  { id: 'sword_steel',  name: 'Epee en Acier',   price: 150, atk: 12, def: 0, hp: 0  },
  { id: 'shield_wood',  name: 'Bouclier Bois',   price: 40,  atk: 0,  def: 4, hp: 0  },
  { id: 'shield_iron',  name: 'Bouclier Fer',    price: 120, atk: 0,  def: 9, hp: 0  },
  { id: 'potion_small', name: 'Petite Potion',   price: 25,  atk: 0,  def: 0, hp: 30 },
  { id: 'potion_large', name: 'Grande Potion',   price: 60,  atk: 0,  def: 0, hp: 80 },
  { id: 'tome_fire',    name: 'Tome du Feu',     price: 200, atk: 8,  def: 0, hp: 0  },
  { id: 'amulet_life',  name: 'Amulette de Vie', price: 180, atk: 0,  def: 3, hp: 50 },
];

const LEADERBOARD_ICONS = ['[1]', '[2]', '[3]', '[4]', '[5]'];

function createPlayer(userId, username, className) {
  const cls = CLASSES[className];
  return {
    userId, username, class: className,
    level: 1, xp: 0, xpNeeded: 100,
    hp: cls.hp, maxHp: cls.hp,
    atk: cls.atk, def: cls.def, mana: cls.mana,
    gold: 50, inventory: [],
    activeQuest: null, questProgress: {},
    stats: { kills: 0, dungeons: 0, wins: 0, losses: 0 },
    createdAt: Date.now(),
  };
}

function getPlayer(userId) { return db.players.get(userId); }

function gainXP(player, amount) {
  player.xp += amount;
  let leveled = false;
  while (player.xp >= player.xpNeeded) {
    player.xp -= player.xpNeeded;
    player.level++;
    player.xpNeeded = Math.floor(100 * Math.pow(1.4, player.level - 1));
    const cls = CLASSES[player.class];
    player.maxHp = Math.floor(cls.hp  * (1 + (player.level - 1) * 0.1));
    player.atk   = Math.floor(cls.atk * (1 + (player.level - 1) * 0.08));
    player.def   = Math.floor(cls.def * (1 + (player.level - 1) * 0.08));
    leveled = true;
  }
  return leveled;
}

function healPlayer(player) { player.hp = player.maxHp; }

function getProgressBar(current, max, length) {
  length = length || 10;
  const filled = Math.round((current / max) * length);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(length - filled);
}

function randomMonster(level) {
  level = level || 1;
  const maxIdx = Math.min(Math.floor(level / 2), MONSTERS.length - 1);
  const idx    = Math.floor(Math.random() * (maxIdx + 1));
  return Object.assign({}, MONSTERS[idx], { currentHp: MONSTERS[idx].hp });
}

function cv2(components, ephemeral) {
  return { flags: ephemeral ? 32768 | 64 : 32768, components: components };
}

function text(content)           { return { type: 10, content: content }; }
function sep(divider, spacing)   { return { type: 14, divider: divider !== false, spacing: spacing || 1 }; }
function actionRow(buttons)      { return { type: 1, components: buttons }; }

function btn(label, customId, style, emoji, disabled) {
  const b = { type: 2, style: style || 1, label: label, custom_id: customId, disabled: !!disabled };
  if (emoji) b.emoji = { name: emoji };
  return b;
}

function container(components) {
  return { type: 17, components: components };
}

function buildProfileMessage(player, ephemeral) {
  if (ephemeral === undefined) ephemeral = true;
  const cls    = CLASSES[player.class];
  const hpBar  = getProgressBar(player.hp, player.maxHp);
  const xpBar  = getProgressBar(player.xp, player.xpNeeded);
  const rankMsg = player.level >= 20 ? 'Legendaire' : player.level >= 10 ? 'Elite' : player.level >= 5 ? 'Veteran' : 'Novice';

  return cv2([
    container([
      text('# ' + cls.emoji + ' ' + player.username),
      text('**Classe :** ' + cls.name + '  |  **Rang :** ' + rankMsg),
      sep(),
      text('**Niveau ' + player.level + '** - XP : `' + player.xp + '/' + player.xpNeeded + '`\n`' + xpBar + '`'),
      sep(false),
      text('HP : `' + player.hp + '/' + player.maxHp + '`  `' + hpBar + '`\nATK : **' + player.atk + '**  DEF : **' + player.def + '**  MANA : **' + player.mana + '**'),
      sep(),
      text('Or : **' + player.gold + '**\nInventaire : **' + player.inventory.length + '** objets\nTues : **' + player.stats.kills + '**  Duels W/L : **' + player.stats.wins + '/' + player.stats.losses + '**  Donjons : **' + player.stats.dungeons + '**'),
      sep(),
      actionRow([
        btn('Combat',     'action_fight'),
        btn('Donjon',     'action_dungeon',     2),
        btn('Quetes',     'action_quests',      2),
        btn('Boutique',   'action_shop',        2),
        btn('Classement', 'action_leaderboard', 2),
      ]),
    ]),
  ], ephemeral);
}

function buildFightMessage(player, monster, round, log) {
  round = round || 1;
  const hpBarP = getProgressBar(player.hp, player.maxHp);
  const hpBarM = getProgressBar(monster.currentHp, monster.hp);
  const components = [
    text('# Combat - Round ' + round),
    sep(),
    text('**' + CLASSES[player.class].emoji + ' ' + player.username + '** (Niv. ' + player.level + ')\nHP : `' + player.hp + '/' + player.maxHp + '`  `' + hpBarP + '`'),
    text('**VS**'),
    text('**' + monster.emoji + ' ' + monster.name + '**\nHP : `' + monster.currentHp + '/' + monster.hp + '`  `' + hpBarM + '`'),
  ];
  if (log) { components.push(sep()); components.push(text('> ' + log)); }
  components.push(sep());
  components.push(actionRow([
    btn('Attaquer',  'fight_attack'),
    btn('Defendre',  'fight_defend', 2),
    btn('Potion',    'fight_potion', 3),
    btn('Fuir',      'fight_flee',   4),
  ]));
  return cv2([container(components)]);
}

function buildShopMessage(player) {
  const itemList = SHOP_ITEMS.map(function(i) {
    const bonusParts = [];
    if (i.atk) bonusParts.push('+' + i.atk + ' ATK');
    if (i.def) bonusParts.push('+' + i.def + ' DEF');
    if (i.hp)  bonusParts.push('+' + i.hp  + ' PV');
    const bonus = bonusParts.join(' ');
    const owned = player.inventory.some(function(inv) { return inv.id === i.id; }) ? ' [OK]' : '';
    return '**' + i.name + '**' + owned + ' - ' + i.price + ' or (' + bonus + ')';
  }).join('\n');

  return cv2([
    container([
      text('# Boutique'),
      text('Or disponible : **' + player.gold + '**'),
      sep(),
      text(itemList),
      sep(),
      actionRow(SHOP_ITEMS.slice(0, 4).map(function(i) {
        return btn(i.name.substring(0, 15), 'buy_' + i.id, 2, null, player.gold < i.price);
      })),
      actionRow(SHOP_ITEMS.slice(4).map(function(i) {
        return btn(i.name.substring(0, 15), 'buy_' + i.id, 2, null, player.gold < i.price);
      })),
    ]),
  ]);
}

function buildQuestMessage(player) {
  const lines = QUESTS.map(function(q) {
    const active   = player.activeQuest === q.id;
    const progress = active ? (player.questProgress[q.id] || 0) : 0;
    const done     = active && progress >= q.count;
    const marker   = done ? '[OK]' : active ? '[EN COURS]' : '[DISPO]';
    return marker + ' **' + q.name + '** (' + q.difficulty + ')\n  ' + q.description + '\n  Recompense : +' + q.reward.xp + ' XP, +' + q.reward.gold + ' or' + (active ? '\n  Progression : ' + progress + '/' + q.count : '');
  }).join('\n\n');

  const buttons = QUESTS.map(function(q) {
    const active   = player.activeQuest === q.id;
    const progress = player.questProgress[q.id] || 0;
    const done     = active && progress >= q.count;
    const label    = done ? 'Reclamer' : active ? 'Active' : 'Accepter';
    const style    = done ? 3 : active ? 2 : 1;
    const disabled = !done && !!player.activeQuest && !active;
    return btn(label, 'quest_' + (done ? 'claim' : 'accept') + '_' + q.id, style, null, disabled);
  });

  return cv2([
    container([
      text('# Tableau des Quetes'),
      text('Tu peux avoir **1 quete active** a la fois.'),
      sep(),
      text(lines),
      sep(),
      actionRow(buttons),
    ]),
  ]);
}

function buildLeaderboardMessage() {
  const sorted = Array.from(db.players.values())
    .sort(function(a, b) { return (b.level * 10000 + b.xp) - (a.level * 10000 + a.xp); })
    .slice(0, 5);

  if (sorted.length === 0) {
    return cv2([container([text('# Classement\n\nAucun joueur pour l\'instant !')])]);
  }

  const rows = sorted.map(function(p, i) {
    const cls = CLASSES[p.class];
    return (LEADERBOARD_ICONS[i] || (i + 1) + '.') + ' **' + p.username + '** - ' + cls.emoji + ' Niv. **' + p.level + '** | ' + p.stats.kills + ' kills | ' + p.gold + ' or';
  }).join('\n');

  return cv2([
    container([
      text('# Classement des Heros'),
      sep(),
      text(rows),
      sep(false),
      text('Top 5 joueurs par niveau et XP'),
    ]),
  ]);
}

function buildDungeonMessage(player, floor, monster, log) {
  const hpBar = getProgressBar(player.hp, player.maxHp);
  const components = [
    text('# Donjon - Etage ' + floor),
    text('HP : `' + player.hp + '/' + player.maxHp + '`  `' + hpBar + '`'),
    sep(),
    text('**' + monster.emoji + ' ' + monster.name + "** t'affronte ! (PV: " + monster.currentHp + ')'),
  ];
  if (log) components.push(text('> ' + log));
  components.push(sep());
  components.push(actionRow([
    btn('Attaquer', 'dungeon_attack_' + floor),
    btn('Potion',   'dungeon_potion_' + floor, 2),
    btn('Fuir',     'dungeon_flee_'   + floor, 4),
  ]));
  return cv2([container(components)]);
}

function buildCreateCharacterModal() {
  return {
    type: 9,
    data: {
      custom_id: 'modal_create_character',
      title: 'Creer ton Personnage',
      components: [
        {
          type: 18,
          label: 'Nom de ton personnage',
          description: 'Entre 3 et 20 caracteres',
          component: {
            type: 4,
            custom_id: 'char_name',
            style: 1,
            min_length: 3,
            max_length: 20,
            placeholder: 'Ex: Arthas, Gandalf...',
            required: true,
          },
        },
      ],
    },
  };
}

function buildFeedbackModal() {
  return {
    type: 9,
    data: {
      custom_id: 'modal_feedback',
      title: 'Feedback sur le Bot',
      components: [
        {
          type: 18,
          label: 'Ton avis general ?',
          description: 'Suggestions, bugs, idees...',
          component: { type: 4, custom_id: 'feedback_text',      style: 2, min_length: 10, max_length: 1000, placeholder: 'Ecris ton feedback ici...', required: true },
        },
        {
          type: 18,
          label: 'Note globale (1-10)',
          component: { type: 4, custom_id: 'feedback_note',      style: 1, min_length: 1,  max_length: 2,    placeholder: '7', required: false },
        },
        {
          type: 18,
          label: 'Fonctionnalite preferee ?',
          component: { type: 4, custom_id: 'feedback_favorite',  style: 1, max_length: 100, placeholder: 'Combat, Donjon, Quetes...', required: false },
        },
        {
          type: 18,
          label: 'Qu\'est-ce qu\'on devrait ameliorer ?',
          component: { type: 4, custom_id: 'feedback_improve',   style: 2, max_length: 500, placeholder: 'Decris ce qui pourrait etre mieux...', required: false },
        },
        {
          type: 18,
          label: 'Recommanderais-tu ce bot ? (oui/non)',
          component: { type: 4, custom_id: 'feedback_recommend', style: 1, min_length: 2, max_length: 3, placeholder: 'oui', required: false },
        },
      ],
    },
  };
}

const activeFights = new Map();

function calcDamage(atk, def, crit) {
  const base = Math.max(1, atk - Math.floor(def / 2));
  const roll = Math.floor(base * (0.8 + Math.random() * 0.4));
  return crit ? Math.floor(roll * 1.75) : roll;
}

function handleFightAttack(player, fight) {
  const isCrit = Math.random() < 0.15;
  const dmgToM = calcDamage(player.atk, fight.monster.def, isCrit);
  const dmgToP = fight.defending
    ? Math.max(0, calcDamage(fight.monster.atk, player.def + 5))
    : calcDamage(fight.monster.atk, player.def);
  fight.monster.currentHp -= dmgToM;
  player.hp = Math.max(0, player.hp - dmgToP);
  fight.defending = false;
  fight.round++;
  return 'Tu infliges **' + dmgToM + '** degats' + (isCrit ? ' (CRITIQUE!)' : '') + ' | Le monstre t\'inflige **' + dmgToP + '** degats';
}

const commands = [
  { name: 'start',      description: 'Commencer ton aventure et creer ton personnage', type: 1 },
  { name: 'profil',     description: 'Voir ton profil de heros', type: 1 },
  { name: 'combat',     description: 'Partir combattre un monstre aleatoire', type: 1 },
  { name: 'donjon',     description: 'Entrer dans un donjon (5 etages, recompenses bonus)', type: 1 },
  { name: 'boutique',   description: "Ouvrir la boutique d'equipement", type: 1 },
  { name: 'quetes',     description: 'Voir le tableau des quetes', type: 1 },
  { name: 'classement', description: 'Voir le classement des meilleurs heros', type: 1 },
  { name: 'repos',      description: 'Te reposer pour recuperer tous tes PV (gratuit)', type: 1 },
  {
    name: 'duel',
    description: 'Defier un autre joueur',
    type: 1,
    options: [{ name: 'joueur', description: 'Le joueur que tu veux defier', type: 6, required: true }],
  },
  { name: 'feedback', description: 'Envoyer un feedback sur le bot', type: 1 },
  { name: 'aide',     description: "Afficher l'aide complete", type: 1 },
];

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once('clientReady', async function() {
  console.log('Bot connecte en tant que ' + client.user.tag);
  console.log('Enregistrement des slash commands...');
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(APP_ID), { body: commands });
    console.log('Slash commands enregistrees globalement');
  } catch (err) {
    console.error("Erreur lors de l'enregistrement des commandes :", err);
  }
});

client.on('interactionCreate', async function(interaction) {
  try {
    if      (interaction.isChatInputCommand()) { await handleSlashCommand(interaction); }
    else if (interaction.isButton())           { await handleButton(interaction); }
    else if (interaction.isModalSubmit())      { await handleModal(interaction); }
  } catch (err) {
    console.error('Erreur interaction :', err);
  }
});

async function handleSlashCommand(interaction) {
  const commandName = interaction.commandName;
  const user        = interaction.user;
  const player      = getPlayer(user.id);

  if (commandName === 'start') {
    if (player) {
      await interaction.reply(cv2([
        container([
          text('# Tu as deja un personnage !'),
          text('**' + player.username + '** - Niv. ' + player.level + '\n\nUtilise `/profil` pour le voir.'),
        ]),
      ], true));
      return;
    }
    await interaction.showModal(buildCreateCharacterModal().data);
    return;
  }

  if (commandName === 'aide') {
    await interaction.reply(cv2([
      container([
        text('# Guide du Heros'),
        sep(),
        text(
          '**Commandes disponibles :**\n' +
          '`/start` - Creer ton personnage\n' +
          '`/profil` - Voir tes stats\n' +
          '`/combat` - Combattre un monstre\n' +
          '`/donjon` - Entrer dans un donjon (5 etages)\n' +
          '`/boutique` - Acheter des equipements\n' +
          '`/quetes` - Voir et accepter des quetes\n' +
          '`/classement` - Top 5 des heros\n' +
          '`/repos` - Recuperer tous tes PV\n' +
          '`/duel @joueur` - Defier quelqu\'un\n' +
          '`/feedback` - Nous donner ton avis'
        ),
        sep(),
        text(
          '**Comment jouer :**\n' +
          '1. Cree ton personnage avec `/start`\n' +
          '2. Combats des monstres pour gagner XP et or\n' +
          '3. Monte de niveau pour devenir plus fort\n' +
          '4. Accepte des quetes pour des recompenses bonus\n' +
          '5. Equipe-toi a la boutique\n' +
          '6. Defie d\'autres joueurs en duel !'
        ),
      ]),
    ], true));
    return;
  }

  if (commandName === 'classement') {
    await interaction.reply(buildLeaderboardMessage());
    return;
  }

  if (commandName === 'feedback') {
    await interaction.showModal(buildFeedbackModal().data);
    return;
  }

  if (!player) {
    await interaction.reply(cv2([
      container([
        text('# Pas encore de personnage !'),
        text("Utilise `/start` pour creer ton heros et commencer l'aventure."),
      ]),
    ], true));
    return;
  }

  if (commandName === 'profil') {
    await interaction.reply(buildProfileMessage(player));
  }

  else if (commandName === 'combat') {
    if (activeFights.has(user.id)) {
      await interaction.reply(cv2([container([text('Tu as deja un combat en cours !')])], true));
      return;
    }
    const monster = randomMonster(player.level);
    activeFights.set(user.id, { monster: monster, defending: false, round: 1, type: 'wild' });
    await interaction.reply(buildFightMessage(player, monster, 1, 'Un **' + monster.name + '** surgit des ombres !'));
  }

  else if (commandName === 'donjon') {
    if (activeFights.has(user.id)) {
      await interaction.reply(cv2([container([text('Tu as deja un combat en cours !')])], true));
      return;
    }
    const monster = randomMonster(player.level);
    activeFights.set(user.id, { monster: monster, defending: false, round: 1, type: 'dungeon', floor: 1 });
    await interaction.reply(buildDungeonMessage(player, 1, monster, 'Tu entres dans le donjon. Au premier etage, un **' + monster.name + "** t'attend !"));
  }

  else if (commandName === 'boutique') {
    await interaction.reply(buildShopMessage(player));
  }

  else if (commandName === 'quetes') {
    await interaction.reply(buildQuestMessage(player));
  }

  else if (commandName === 'repos') {
    healPlayer(player);
    await interaction.reply(cv2([
      container([
        text('# Repos Bien Merite'),
        text("Tu te reposes a l'auberge du village...\nPV completement restaures ! `" + player.maxHp + '/' + player.maxHp + '`'),
      ]),
    ], true));
  }

  else if (commandName === 'duel') {
    const target = interaction.options.getUser('joueur');
    if (target.id === user.id) {
      await interaction.reply(cv2([container([text('Tu ne peux pas te defier toi-meme !')])], true));
      return;
    }
    const targetPlayer = getPlayer(target.id);
    if (!targetPlayer) {
      await interaction.reply(cv2([container([text('**' + target.username + "** n'a pas encore de personnage !")])], true));
      return;
    }
    const duelId = user.id + '_' + target.id;
    db.duels.set(duelId, { challengerId: user.id, targetId: target.id });
    await interaction.reply(cv2([
      container([
        text('# Defi en Duel !'),
        text('**' + player.username + '** (Niv. ' + player.level + ') defie **' + targetPlayer.username + '** (Niv. ' + targetPlayer.level + ') !\n\n<@' + target.id + '>, acceptes-tu le duel ?'),
        sep(),
        actionRow([
          btn('Accepter', 'duel_accept_' + duelId, 3),
          btn('Refuser',  'duel_refuse_' + duelId, 4),
        ]),
      ]),
    ]));
  }
}

async function handleButton(interaction) {
  const customId = interaction.customId;
  const user     = interaction.user;
  const player   = getPlayer(user.id);

  if (customId.startsWith('setclass_')) {
    const className = customId.slice('setclass_'.length);
    if (!player || !CLASSES[className]) return;
    const cls    = CLASSES[className];
    player.class = className;
    player.hp    = cls.hp;  player.maxHp = cls.hp;
    player.atk   = cls.atk; player.def   = cls.def; player.mana = cls.mana;
    await interaction.update(cv2([
      container([
        text('# Aventure Commencee !'),
        text('**' + player.username + '** - ' + cls.name + '\n\nHP : **' + cls.hp + '**  ATK : **' + cls.atk + '**  DEF : **' + cls.def + '**  MANA : **' + cls.mana + '**\n\nTu commences avec **50 or**. Utilise `/profil` pour voir tes stats !'),
        sep(),
        actionRow([
          btn('Mon Profil',     'action_profile', 1),
          btn('Premier Combat', 'action_fight',   3),
        ]),
      ]),
    ], true));
    return;
  }

  if (customId === 'action_profile') {
    if (!player) { await interaction.reply(cv2([container([text('Pas de personnage !')])], true)); return; }
    await interaction.reply(buildProfileMessage(player));
    return;
  }

  if (customId === 'action_fight') {
    if (!player) { await interaction.reply(cv2([container([text('Pas de personnage !')])], true)); return; }
    if (activeFights.has(user.id)) { await interaction.reply(cv2([container([text('Tu as deja un combat en cours !')])], true)); return; }
    const monster = randomMonster(player.level);
    activeFights.set(user.id, { monster: monster, defending: false, round: 1, type: 'wild' });
    await interaction.reply(buildFightMessage(player, monster, 1, 'Un **' + monster.name + '** surgit !'));
    return;
  }

  if (customId === 'action_dungeon') {
    if (!player) { await interaction.reply(cv2([container([text('Pas de personnage !')])], true)); return; }
    if (activeFights.has(user.id)) { await interaction.reply(cv2([container([text('Tu as deja un combat en cours !')])], true)); return; }
    const monster = randomMonster(player.level);
    activeFights.set(user.id, { monster: monster, defending: false, round: 1, type: 'dungeon', floor: 1 });
    await interaction.reply(buildDungeonMessage(player, 1, monster, "Tu entres dans le donjon !"));
    return;
  }

  if (customId === 'action_quests') {
    if (!player) return;
    await interaction.reply(buildQuestMessage(player));
    return;
  }

  if (customId === 'action_shop') {
    if (!player) return;
    await interaction.reply(buildShopMessage(player));
    return;
  }

  if (customId === 'action_leaderboard') {
    await interaction.reply(buildLeaderboardMessage());
    return;
  }

  if (customId.startsWith('fight_')) {
    if (!player) return;
    const fight = activeFights.get(user.id);
    if (!fight || fight.type !== 'wild') {
      await interaction.reply(cv2([container([text('Pas de combat actif !')])], true));
      return;
    }

    if (customId === 'fight_flee') {
      activeFights.delete(user.id);
      await interaction.update(cv2([container([
        text('# Fuite reussie !'),
        text("Tu t'echappes du combat avec **" + fight.monster.name + '**. Lache !'),
      ])]));
      return;
    }

    if (customId === 'fight_defend') {
      fight.defending = true;
      const dmgToP = Math.max(0, calcDamage(fight.monster.atk, player.def + 8, false));
      player.hp = Math.max(0, player.hp - dmgToP);
      fight.round++;
      if (player.hp <= 0) {
        activeFights.delete(user.id);
        player.stats.losses++;
        player.hp = Math.floor(player.maxHp * 0.3);
        await interaction.update(cv2([container([
          text('# Defaite !'),
          text("Tu t'es effondre face a **" + fight.monster.name + "**...\nTu te reveilles a l'auberge avec " + player.hp + ' PV.'),
        ])]));
        return;
      }
      await interaction.update(buildFightMessage(player, fight.monster, fight.round, 'Tu te defends ! Le monstre t\'inflige seulement **' + dmgToP + '** degats.'));
      return;
    }

    if (customId === 'fight_potion') {
      const potionIdx = player.inventory.findIndex(function(i) { return i.hp > 0; });
      if (potionIdx === -1) {
        await interaction.reply(cv2([container([text("Tu n'as pas de potion !")])], true));
        return;
      }
      const potion = player.inventory.splice(potionIdx, 1)[0];
      const healed = Math.min(potion.hp, player.maxHp - player.hp);
      player.hp   += healed;
      const dmgToP = calcDamage(fight.monster.atk, player.def, false);
      player.hp    = Math.max(0, player.hp - dmgToP);
      fight.round++;
      await interaction.update(buildFightMessage(player, fight.monster, fight.round, 'Tu utilises **' + potion.name + '** et recuperes **' + healed + '** PV ! Le monstre t\'inflige **' + dmgToP + '** degats.'));
      return;
    }

    if (customId === 'fight_attack') {
      const log = handleFightAttack(player, fight);

      if (fight.monster.currentHp <= 0) {
        activeFights.delete(user.id);
        const xpGained  = fight.monster.xp;
        const goldGained = fight.monster.gold + Math.floor(Math.random() * 10);
        const leveled   = gainXP(player, xpGained);
        player.gold    += goldGained;
        player.stats.kills++;
        if (player.activeQuest) {
          const quest = QUESTS.find(function(q) { return q.id === player.activeQuest; });
          if (quest && quest.type === 'kill' && fight.monster.name === quest.target) {
            player.questProgress[player.activeQuest] = (player.questProgress[player.activeQuest] || 0) + 1;
          }
        }
        const levelMsg = leveled ? '\n**NIVEAU SUPERIEUR ! Tu es maintenant niveau ' + player.level + ' !**' : '';
        await interaction.update(cv2([
          container([
            text('# Victoire !'),
            text('Tu as vaincu **' + fight.monster.name + '** !\n\n+' + xpGained + ' XP  |  +' + goldGained + ' or' + levelMsg),
            sep(),
            actionRow([
              btn('Recombattre', 'action_fight'),
              btn('Profil',      'action_profile', 2),
            ]),
          ]),
        ]));
        return;
      }

      if (player.hp <= 0) {
        activeFights.delete(user.id);
        player.stats.losses++;
        player.hp = Math.floor(player.maxHp * 0.3);
        const goldLost = Math.floor(player.gold * 0.05);
        player.gold = Math.max(0, player.gold - goldLost);
        await interaction.update(cv2([
          container([
            text('# Defaite...'),
            text('Tu as ete vaincu par **' + fight.monster.name + '** !\nTu perds **' + goldLost + "** or.\nTu te reveilles a l'auberge avec " + player.hp + ' PV.'),
            sep(),
            actionRow([btn('Se reposer', 'action_profile', 2)]),
          ]),
        ]));
        return;
      }

      await interaction.update(buildFightMessage(player, fight.monster, fight.round, log));
    }
    return;
  }

  if (customId.startsWith('dungeon_')) {
    if (!player) return;
    const parts  = customId.split('_');
    const action = parts[1];
    const fight  = activeFights.get(user.id);
    if (!fight || fight.type !== 'dungeon') {
      await interaction.reply(cv2([container([text('Pas de donjon actif !')])], true));
      return;
    }

    if (action === 'flee') {
      activeFights.delete(user.id);
      await interaction.update(cv2([container([text("Tu fuis le donjon a l'etage " + fight.floor + '...')])]));
      return;
    }

    if (action === 'potion') {
      const potionIdx = player.inventory.findIndex(function(i) { return i.hp > 0; });
      if (potionIdx === -1) {
        await interaction.reply(cv2([container([text('Pas de potion !')])], true));
        return;
      }
      const potion = player.inventory.splice(potionIdx, 1)[0];
      player.hp = Math.min(player.maxHp, player.hp + potion.hp);
      await interaction.update(buildDungeonMessage(player, fight.floor, fight.monster, 'Tu utilises **' + potion.name + '** et recuperes **' + potion.hp + '** PV !'));
      return;
    }

    if (action === 'attack') {
      const log = handleFightAttack(player, fight);

      if (fight.monster.currentHp <= 0) {
        gainXP(player, fight.monster.xp);
        player.gold += fight.monster.gold;
        player.stats.kills++;

        if (fight.floor >= 5) {
          activeFights.delete(user.id);
          player.stats.dungeons++;
          const bonusGold = 100 + player.level * 20;
          const bonusXP   = 200 + player.level * 30;
          gainXP(player, bonusXP);
          player.gold += bonusGold;
          if (player.activeQuest) {
            const quest = QUESTS.find(function(q) { return q.id === player.activeQuest && q.type === 'dungeon'; });
            if (quest) player.questProgress[player.activeQuest] = (player.questProgress[player.activeQuest] || 0) + 1;
          }
          await interaction.update(cv2([
            container([
              text('# Donjon Termine !'),
              text('Tu as conquis les **5 etages** du donjon !\n\nBonus : **+' + bonusXP + ' XP** et **+' + bonusGold + ' or**'),
              sep(),
              actionRow([
                btn('Recombattre', 'action_fight'),
                btn('Profil',      'action_profile', 2),
              ]),
            ]),
          ]));
        } else {
          const nextFloor   = fight.floor + 1;
          const nextMonster = randomMonster(player.level + nextFloor);
          fight.monster   = nextMonster;
          fight.floor     = nextFloor;
          fight.round     = 1;
          fight.defending = false;
          await interaction.update(buildDungeonMessage(player, nextFloor, nextMonster, 'Etage ' + (nextFloor - 1) + " termine ! Tu descends a l'etage " + nextFloor + '...'));
        }
        return;
      }

      if (player.hp <= 0) {
        activeFights.delete(user.id);
        player.stats.losses++;
        player.hp = Math.floor(player.maxHp * 0.25);
        await interaction.update(cv2([
          container([
            text('# Vaincu dans le donjon a l\'etage ' + fight.floor + '...'),
            text("Tu t'effondres et es ramene a l'exterieur."),
          ]),
        ]));
        return;
      }

      await interaction.update(buildDungeonMessage(player, fight.floor, fight.monster, log));
    }
    return;
  }

  if (customId.startsWith('buy_')) {
    if (!player) return;
    const itemId = customId.slice(4);
    const item   = SHOP_ITEMS.find(function(i) { return i.id === itemId; });
    if (!item) return;
    if (player.gold < item.price) {
      await interaction.reply(cv2([container([text("Pas assez d'or ! Il t'en faut **" + item.price + "**, tu as **" + player.gold + '**.')])], true));
      return;
    }
    if (player.inventory.some(function(i) { return i.id === itemId; })) {
      await interaction.reply(cv2([container([text('Tu possedes deja **' + item.name + '** !')])], true));
      return;
    }
    player.gold -= item.price;
    player.inventory.push(Object.assign({}, item));
    if (item.atk) player.atk += item.atk;
    if (item.def) player.def += item.def;
    if (item.hp)  { player.maxHp += item.hp; player.hp = Math.min(player.hp + item.hp, player.maxHp); }
    await interaction.reply(cv2([
      container([
        text('# Achat Reussi !'),
        text('Tu as achete **' + item.name + '** pour **' + item.price + '** or.\nIl te reste **' + player.gold + '** or.'),
      ]),
    ], true));
    return;
  }

  if (customId.startsWith('quest_accept_')) {
    if (!player) return;
    const questId = customId.slice('quest_accept_'.length);
    const quest   = QUESTS.find(function(q) { return q.id === questId; });
    if (!quest) return;
    if (player.activeQuest && player.activeQuest !== questId) {
      await interaction.reply(cv2([container([text("Tu as deja une quete active ! Termine-la d'abord.")])], true));
      return;
    }
    player.activeQuest = questId;
    if (!player.questProgress[questId]) player.questProgress[questId] = 0;
    await interaction.reply(cv2([
      container([
        text('# Quete Acceptee !'),
        text('**' + quest.name + '**\n' + quest.description + '\n\n**Objectif :** ' + quest.objective),
      ]),
    ], true));
    return;
  }

  if (customId.startsWith('quest_claim_')) {
    if (!player) return;
    const questId = customId.slice('quest_claim_'.length);
    const quest   = QUESTS.find(function(q) { return q.id === questId; });
    if (!quest) return;
    const progress = player.questProgress[questId] || 0;
    if (progress < quest.count) {
      await interaction.reply(cv2([container([text('Quete pas encore terminee !')])], true));
      return;
    }
    player.activeQuest = null;
    player.questProgress[questId] = 0;
    const leveled  = gainXP(player, quest.reward.xp);
    player.gold   += quest.reward.gold;
    const levelMsg = leveled ? '\n**NIVEAU SUPERIEUR ! Tu es niveau ' + player.level + ' !**' : '';
    await interaction.reply(cv2([
      container([
        text('# Quete Accomplie !'),
        text('**' + quest.name + '** terminee !\n\n+' + quest.reward.xp + ' XP  |  +' + quest.reward.gold + ' or' + levelMsg),
      ]),
    ], true));
    return;
  }

  if (customId.startsWith('duel_accept_') || customId.startsWith('duel_refuse_')) {
    const isAccept = customId.startsWith('duel_accept_');
    const duelId   = customId.slice(isAccept ? 'duel_accept_'.length : 'duel_refuse_'.length);
    const duel     = db.duels.get(duelId);

    if (!duel) {
      await interaction.reply(cv2([container([text("Ce duel n'existe plus.")])], true));
      return;
    }
    if (user.id !== duel.targetId) {
      await interaction.reply(cv2([container([text('Ce duel ne te concerne pas !')])], true));
      return;
    }

    db.duels.delete(duelId);

    if (!isAccept) {
      await interaction.update(cv2([container([text('Le duel a ete refuse.')])]));
      return;
    }

    const challenger = getPlayer(duel.challengerId);
    const defender   = getPlayer(duel.targetId);
    if (!challenger || !defender) {
      await interaction.update(cv2([container([text("Un des joueurs n'existe plus.")])]));
      return;
    }

    let challengerHp = challenger.maxHp;
    let defenderHp   = defender.maxHp;
    const logs = [];
    for (let r = 1; r <= 5 && challengerHp > 0 && defenderHp > 0; r++) {
      const dmgC = calcDamage(challenger.atk, defender.def,   Math.random() < 0.1);
      const dmgD = calcDamage(defender.atk,   challenger.def, Math.random() < 0.1);
      challengerHp -= dmgD;
      defenderHp   -= dmgC;
      logs.push('Round ' + r + ': ' + challenger.username + ' inflige **' + dmgC + '** | ' + defender.username + ' inflige **' + dmgD + '**');
    }

    const challengerWon = challengerHp > defenderHp;
    const winner    = challengerWon ? challenger : defender;
    const loser     = challengerWon ? defender   : challenger;
    const prizeGold = Math.min(50, Math.floor(loser.gold * 0.1));
    winner.stats.wins++;
    loser.stats.losses++;
    gainXP(winner, 80);
    winner.gold += prizeGold;
    loser.gold   = Math.max(0, loser.gold - prizeGold);

    await interaction.update(cv2([
      container([
        text('# Resultat du Duel'),
        sep(),
        text(logs.join('\n')),
        sep(),
        text('**' + winner.username + '** remporte le duel !\n+80 XP  |  +' + prizeGold + ' or pris a ' + loser.username),
      ]),
    ]));
    return;
  }
}

async function handleModal(interaction) {
  const customId = interaction.customId;
  const user     = interaction.user;

  if (customId === 'modal_create_character') {
    const name = interaction.fields.getTextInputValue('char_name');
    if (db.players.has(user.id)) {
      await interaction.reply(cv2([container([text('Tu as deja un personnage !')])], true));
      return;
    }
    db.players.set(user.id, createPlayer(user.id, name, 'warrior'));
    await interaction.reply(cv2([
      container([
        text('# Bienvenue, **' + name + '** !'),
        text(
          'Choisis ta classe pour commencer ton aventure !\n\n' +
          '**Guerrier** - Resistant, equilibre, ideal pour les debutants\n' +
          '**Mage** - Tres puissant en attaque, mais fragile\n' +
          '**Voleur** - Rapide et critique souvent\n' +
          '**Paladin** - Tank avec capacite de soin'
        ),
        sep(),
        actionRow([
          btn('Guerrier', 'setclass_warrior', 1),
          btn('Mage',     'setclass_mage',    2),
          btn('Voleur',   'setclass_rogue',   2),
          btn('Paladin',  'setclass_paladin', 2),
        ]),
      ]),
    ], true));
    return;
  }

  if (customId === 'modal_feedback') {
    const feedbackText = interaction.fields.getTextInputValue('feedback_text');
    const note         = interaction.fields.getTextInputValue('feedback_note')      || '?';
    const favorite     = interaction.fields.getTextInputValue('feedback_favorite')  || '-';
    const improve      = interaction.fields.getTextInputValue('feedback_improve')   || '-';
    const recommend    = interaction.fields.getTextInputValue('feedback_recommend') || '-';
    console.log('Feedback de ' + user.username + ' - note: ' + note + '/10 - recommande: ' + recommend);
    console.log('  Favori: ' + favorite + ' | Ameliorer: ' + improve);
    console.log('  Avis: ' + feedbackText);
    await interaction.reply(cv2([
      container([
        text('# Merci pour ton feedback !'),
        text('**Note :** ' + note + '/10  |  **Recommande :** ' + recommend + '\n**Favori :** ' + favorite + '\n\nNous avons bien recu ton message et en tiendrons compte.'),
      ]),
    ], true));
    return;
  }
}

client.login(TOKEN).catch(function(err) {
  console.error('Impossible de se connecter :', err.message);
});