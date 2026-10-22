// Site-wide settings used by the layout, metadata and sitemap.

export const site = {
  url: "https://boraytuna.com",
  name: "Boray Tuna Gören",
  // Appended to every page title ("Projects | Boray Tuna Gören").
  titleSuffix: "Boray Tuna Gören",
  locale: "en_US",
  logo: "/images/logo-aop63rxbqgfzze3e.png",
  // 480px WebP made by scripts/optimize-images.mjs; plenty for a ~48px-tall header logo on retina screens.
  logoSmall: "/_img/logo-aop63rxbqgfzze3e-480.webp",
  resume: "/files/boray_tuna_goren_resume_september_2026-s3zr1ca6hxg9hxlq.pdf",
};

export const nav = [
  { href: "/", label: "Home" },
  { href: "/my-projects", label: "Projects" },
  { href: "/blog-list-software-developer", label: "Blog" },
  { href: "/boray-tuna-goren-about-me", label: "About Me" },
  { href: "/contact", label: "Contact" },
];

export type SocialIcon = "instagram" | "linkedin" | "github" | "youtube" | "reddit";

export const socials: { href: string; label: string; icon: SocialIcon }[] = [
  { href: "https://www.instagram.com/boraytuna/", label: "Instagram", icon: "instagram" },
  { href: "https://www.linkedin.com/in/boray-tuna-goren/", label: "LinkedIn", icon: "linkedin" },
  { href: "https://github.com/boraytuna", label: "GitHub", icon: "github" },
  { href: "https://www.youtube.com/@boraytuna", label: "YouTube", icon: "youtube" },
  { href: "https://www.reddit.com/user/Durumcekadam/", label: "Reddit", icon: "reddit" },
  { href: "https://www.instagram.com/sbu_vgdc/", label: "SBU Video Game Development Club on Instagram", icon: "instagram" },
];

// Blog cards per page on the Blog page. Post pages use it to link back to the right page.
export const postsPerPage = 6;

// Category labels for the project filter, in display order.
export const projectCategories = ["Game Dev", "Web Apps", "AI", "UX Design", "Utility"];
