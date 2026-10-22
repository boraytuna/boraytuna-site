---
title: "Attack Of Zombies: Police and Soldier"
slug: /attack-of-zombies-police-and-soldier
date: 2024-07-03T14:23:51.177Z
minutesToRead: 1
metaTitle: "Attack Of Zombies: Police and Soldier"
description: Implemented a human attack logic, and imported some new prefabs.
coverImage: /images/my-screenshots-2024-07-03-at-5.26.23a-pm-ybg4jwerqoc88zaz.png
ogImage: /images/my-screenshots-2024-07-03-at-5.26.23a-pm-ybg4jwerqoc88zaz.png
---

<!-- section zanycM -->

![](/images/my-screenshots-2024-07-03-at-5.26.23a-pm-ybg4jwerqoc88zaz.png)

After the last update on my game I have improved human spawner to spawn humans if the central human gets killed during the gameplay, but I limited the number of respawns to make sure there is an end to the level. Yesterday after that, I have started the implementation of human attack, meaning I needed new prefabs so I imported a police prefab.

Then, today I have imported soldier prefab. These two prefabs are different than other humans. Instead of running from the zombies they fight them. That where the human attack implementation came in. Luckily, I was able to finish the human attack implementation today. While I was working on my attack implementation I realized that my code can be optimized, because I was using monobehaviour scripts for almost every script. Then, I added interfaces and base classes to optimize my game. Thus, I have changed the scripts responsible for humans turning zombie, human spawning, zombie health, human attack. In the way I have added 2 different types of human spawning for spawning police and soldier.

![](/images/my-screenshots-2024-07-03-at-5.24.26a-pm-d95gojmg8xipxy29.png)

![](/images/my-screenshots-2024-07-03-at-5.25.03a-pm-yg29bm7wkzs99wvk.png)
