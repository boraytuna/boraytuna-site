---
title: "Horror Game: Making Zombies Move"
slug: /horror-game-making-zombies-move
date: 2024-04-09T13:38:22.316Z
minutesToRead: 1
metaTitle: "Horror Game: Making Zombies Move"
description: Implemented AI and NavMesh to move the zombie objects towards the player
coverImage: /images/navmeshforzombiesclip-mje2ozredvcoo8zj.png
ogImage: /images/navmeshforzombiesclip-mje2ozredvcoo8zj.png
---

<!-- section ze9wUV -->

![](/images/navmeshforzombiesclip-mje2ozredvcoo8zj.png)

After writing the script that handled player movement, I have adjusted it to make the player sprint with left shift key. Also, I added stamina to player. Now, the player can run so much without getting tired. I believe this makes it more realistic.  
After completing player movement, I wanted add zombie objects and implement the logic behind their movement. I used AI and NavMesh to make them follow the player. The white parts on the terrain are the parts the AI can not move. It will help me place more than 1 type of zombie in the same terrain.
