---
title: Duct Divers LLC
description: A production booking, sales and operations platform for Duct Divers LLC, a dryer vent cleaning business, built with Next.js, TypeScript and PostgreSQL.
cardTitle: Duct Divers LLC
summary: A production booking, sales and operations platform for a dryer vent cleaning business, built with Next.js and PostgreSQL.
categories:
  - Web Apps
cardImage: /images/duct-divers-1.png
cardImageAlt: Duct Divers home page with the headline "Enhancing Fire Safety Through Dryer Vent Cleaning"
order: 0
---

## Overview

A production system for Duct Divers LLC, a dryer vent cleaning business. It replaced two disconnected spreadsheet-based tools, a customer booking form and a door-to-door sales tracker, with a single Next.js application backed by one shared PostgreSQL database.

Built in summer 2026 and in daily use by the business.

[Visit ductdiversllc.com](https://ductdiversllc.com)

### The problem

Customers booked online in one system while sales reps booked jobs at customers' doors in another. Neither system knew about the other, so the same time slot could be booked twice with nothing to stop it. The fix needed one source of truth for availability that every booking path goes through.

### What it does

One codebase serves three audiences on one domain:

- **Public site:** service pages with live pricing and a booking flow with address autocomplete and live slot availability.
- **Sales rep portal:** mobile-first pages for reps to submit sales at the door, clock in and out, and see a leaderboard, using the exact same availability logic as the public site.
- **Admin panel:** day-to-day control of bookings, sales, staff, schedules and services, with charts.

![Duct Divers home page with the headline "Enhancing Fire Safety Through Dryer Vent Cleaning"](/images/duct-divers-1.png)

![Services page listing a free inspection, dryer duct cleaning and rebuild, with prices and Book Now buttons](/images/duct-divers-2.png)

![Step 1 of the two-step booking form: name, email, phone number and service address](/images/duct-divers-3.png)

![Staff login page for the admin panel and sales rep portal](/images/duct-divers-4.png)

### Engineering highlights

- **One shared availability check.** Online and in-person bookings go through the same code path and the same table, so slot counts are always correct.
- **No double-bookings under real concurrency.** Booking creation runs in a PostgreSQL function that takes an advisory transaction lock, so the availability check and the insert happen atomically. If two people grab the last slot at the same moment, one succeeds and the other gets a clear "slot no longer available".
- **Layered access control.** Protected pages check the session on the server, every API route re-checks the caller's role, and Row Level Security is enabled on every table.
- **Validated input.** Every write is parsed with Zod before it reaches the database.
- **Ready for growth.** Every table carries a tenant id, so serving a second business later is a data migration, not a rewrite.
- **Reliable reminders.** Calendar-based reminders turned out to be unreliable for events created by a service account, so I built customer and technician reminder emails on Resend instead.

### Tech stack

Next.js 16 (App Router), React 19, TypeScript, Supabase (PostgreSQL, Auth, Row Level Security), Zod, Tailwind CSS, Google Calendar API, Resend, Vitest, Playwright, Vercel.

### Testing

- Unit and integration tests run against a real, disposable database, including a test that fires two simultaneous bookings at the last open slot and checks that exactly one succeeds.
- End-to-end tests run on five browser and device profiles (Chromium, Firefox, WebKit, Pixel 5, iPhone 13) and include automated WCAG 2.1 AA accessibility scans.
- Every branch deploys to its own preview URL backed by a separate database, so production data is never touched during development.

### What I learned

- **Schema changes belong in migrations.** A column added by hand in a database dashboard would have broken online bookings in production. A pre-launch diff of the development and production schemas caught it, and that check is now part of the launch checklist.
- **Find the real cause before fixing.** A dashboard that looked broken was actually correct code reacting to unexpected data. Checking the real data first led to fixing the missing rule instead of the symptom.

<!-- section more -->

[More Projects](/my-projects)
