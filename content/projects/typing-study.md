---
title: Typing Study
slug: /typing-study
cardTitle: Typing Study
summary: A full-stack web app designed for a controlled psychology-style typing
  experiment comparing typing speed and rhythm across devices and age groups.
cardImage: /images/my-screenshots-2025-10-08-at-1.12.35a-pm-mp84bvjbjmc0pnar.png
categories:
  - Web Apps
order: 1
---

<!-- section zVHq_Q -->

### **Typing Study: Cross-Device Keystroke Experiment**

###### **Overview**

This project is a browser-based experiment that measures how typing speed and behavioral patterns differ between devices (laptop vs. smartphone) and age groups (18–22 vs. 40–55).

It’s built as part of my **CS-258 Machine Learning project** and forms the foundation for a later statistical and machine-learning analysis phase.

###### **Features**

-   **Dynamic Consent & Participant Management:**
    
    Generates unique participant IDs, records consent, and logs demographic info.
    
-   **Balanced Randomization System:**
    
    Uses a Google Sheets “meta” tracker to balance device order across age groups, ensuring even sampling between *laptop → phone* and *phone → laptop* conditions.
    
-   **Phase-Based Typing Trials:**
    
    Each participant completes one practice and three recorded sentences per device.
    
    Metrics logged include total typing time, mean and 95th percentile inter-key intervals, pause frequency, and backspace count.
    
-   **Automatic Device Handoff:**
    
    Intelligent cross-device flow using URLs and QR codes — automatically transitions between devices for Phase 2.
    
-   **Google Apps Script Backend:**
    
    Functions as a lightweight REST API for data storage and synchronization across devices.
    

###### **Technologies Used**

-   **Frontend:** HTML, CSS, and Vanilla JavaScript for a responsive interface and real-time user feedback.
    
-   **Backend:** Google Apps Script and the Google Sheets API, acting as a lightweight cloud-based REST server to securely handle participant data, device assignment, and trial timing records.
    
-   **Data Processing (Planned):** Python with NumPy, Pandas, SciPy, and scikit-learn for statistical analysis and machine-learning modeling.
    
-   **Visualization (Planned):** Matplotlib and Seaborn for generating comparative visualizations of typing speed and behavioral metrics across devices and age groups.
    

###### **Upcoming Work**

-   Implement machine-learning models to classify **device type** or **age group** based on keystroke patterns.
    
-   Conduct **two-way mixed ANOVA** to compare mean completion times between age and device factors.
    
-   Add real-time dashboards for participant balance and progress tracking.

##### **Try out the website**

[Typing Website](https://boraytuna.github.io/typing-study/)

##### Check out the project files on Github!

[GitHub](https://github.com/boraytuna/typing-study)

### Images

![](/images/my-screenshots-2025-10-08-at-1.23.43a-pm-mje4bv6lexsnbpbk.png)

![](/images/my-screenshots-2025-10-08-at-1.28.22a-pm-yd0eokxbn4foryp1.png)

![](/images/my-screenshots-2025-10-08-at-1.28.09a-pm-ybn4gv8lmkfbypoj.png)

![](/images/my-screenshots-2025-10-08-at-1.24.56a-pm-ybgjwk6owohgxkkk.png)

<!-- section more -->

[More Projects](/my-projects)
