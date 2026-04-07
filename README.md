# Discord RPG Bot

Un bot Discord RPG avec système de combat, donjons, quêtes, boutique et duels entre joueurs.

## Fonctionnalités

- **Personnages** : Création de héros avec 4 classes : Guerrier, Mage, Voleur, Paladin
- **Combat** : Affrontez des monstres en temps réel (attaque, défense, potion, fuite)
- **Donjons** : Progression par étages avec difficulté croissante
- **Quêtes** : Objectifs à accomplir pour gagner XP et or
- **Boutique** : Achat d'équipements et de consommables
- **Duels** : Combats PvP entre joueurs avec mise d'or
- **Classement** : Leaderboard basé sur le niveau
- **Système de progression** : Niveaux, XP, stats évolutives

## Installation

```bash
npm i
```

## Configuration

Définissez les variables d'environnement suivantes :

```env
DISCORD_TOKEN=token-here
DISCORD_APP_ID=id-here
```

## Lancement

```bash
node index.js
```

## Classes disponibles

| Classe   | HP  | ATK | DEF | Mana |
|----------|-----|-----|-----|------|
| Guerrier | 120 | 15  | 10  | 30   |
| Mage     | 80  | 25  | 5   | 100  |
| Voleur   | 100 | 20  | 7   | 50   |
| Paladin  | 110 | 12  | 15  | 60   |

## Stack

- [Discord.js](https://discord.js.org/) v14+
- Node.js 18+
- Stockage en mémoire (Map), pas de base de données requise

## Notes

> Les données sont stockées en mémoire et sont perdues au redémarrage du bot. Pour une persistance des données, il est recommandé d'intégrer une base de données (MongoDB, SQLite, etc.).
