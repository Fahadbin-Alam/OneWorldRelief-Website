// Author: Fahadbin Alam (fma52), 4/23/26
// Mod by Codex, 4/23/26
// From One World Relief project content board data, 4/23/26
//
// Field notes:
// - mediaUrl: leave "" until real photos/video exist; the card then shows mediaLabel without a link.
// - update: donor-facing text only. Leave "" to hide the line.
// - thumbnailIsIllustrative: true while thumbnailUrl is a stock photo rather than a photo of this project,
//   so the card labels it honestly. Remove the flag once real project photos are added.
window.ONE_WORLD_RELIEF_PROJECTS = [
  {
    title: "Orphan Hafiz Studies Support",
    category: "Orphan Support",
    status: "Completed",
    location: "Recipient privacy protected",
    date: "Project 001",
    amountRaised: "$600",
    impact: "Study support for an orphan pursuing Hafiz education",
    summary: "One World Relief provided $600 to help support an orphan girl's studies as she continues her Hafiz education.",
    update: "", // TODO(owner): add a short donor-facing progress update
    thumbnailUrl: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=800&q=75",
    thumbnailIsIllustrative: true,
    mediaLabel: "Photos/video coming soon",
    mediaUrl: "",
    donationUrl: "donate.html?campaign=Orphan%20Support#donationForm"
  },
  {
    title: "Village Qurbani Meal Support",
    category: "Feeding",
    status: "Completed",
    location: "Village community",
    date: "Project 002",
    amountRaised: "$900",
    impact: "Qurbani meat shared with a village community",
    summary: "One World Relief funded a $900 Qurbani project so families in a village could receive food and share in the meal.",
    update: "", // TODO(owner): add a short donor-facing progress update
    thumbnailUrl: "https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=800&q=75",
    thumbnailIsIllustrative: true,
    mediaLabel: "Photos/video coming soon",
    mediaUrl: "",
    donationUrl: "donate.html?campaign=Feeding#donationForm"
  },
  {
    title: "Two-Year Orphan Education Support",
    category: "Future Project",
    status: "Planned",
    location: "Recipient privacy protected",
    date: "Future project",
    amountRaised: "$200 goal",
    impact: "Two years of support for an orphan girl's education",
    summary: "A planned project to support an orphan girl for two years with a $200 fundraising goal.",
    update: "", // TODO(owner): add a short donor-facing progress update
    thumbnailUrl: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=800&q=75",
    thumbnailIsIllustrative: true,
    mediaLabel: "Project details coming soon",
    mediaUrl: "",
    donationUrl: "donate.html?campaign=Orphan%20Support#donationForm"
  },
  {
    title: "Food Stand for a Father",
    category: "Future Project",
    status: "Planned",
    location: "Family privacy protected",
    date: "Future project",
    amountRaised: "$1,000 goal",
    impact: "Help a poor man feed his family through a small food stand",
    summary: "A planned livelihood project to provide a food stand so a father can earn income and feed his family.",
    update: "", // TODO(owner): add a short donor-facing progress update
    thumbnailUrl: "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?auto=format&fit=crop&w=800&q=75",
    thumbnailIsIllustrative: true,
    mediaLabel: "Project details coming soon",
    mediaUrl: "",
    donationUrl: "donate.html?campaign=General%20Fund#donationForm"
  }
];
