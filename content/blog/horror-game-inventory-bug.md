---
title: "Horror Game: Inventory Bug"
slug: /horror-game-inventory-bug
date: 2024-04-12T13:21:22.963Z
minutesToRead: 1
metaTitle: "Horror Game: Inventory Bug"
description: Having a bug while removing items from inventory.
coverImage: /images/my-screenshots-2024-04-12-at-9.22.28a-am-doqbx1rbjbu8leb2.png
ogImage: /images/my-screenshots-2024-04-12-at-9.22.28a-am-doqbx1rbjbu8leb2.png
---

<!-- section zpdkOL -->

![](/images/my-screenshots-2024-04-12-at-9.22.28a-am-doqbx1rbjbu8leb2.png)

I just fixed the position the item is being dropped at. Now, it feels like the item is being drooped from first person view. The bigger bug I am trying to fix right now is that, when removing items from inventory UI, if I remove from right to left, there is no problem. But if I remove items from left to right, every item that is to the right of the item I want to remove gets removed from the UI. Also, they stay in the inventory. Their icon gets removed. Now, I want to fix this bug. I want it to work where if I remove one item only that item gets removed. Removing an item shouldn't affect the items around it.
