// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

// Fade project cards in as they scroll into view
const cards = document.querySelectorAll(".card");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  cards.forEach((card) => observer.observe(card));
} else {
  cards.forEach((card) => card.classList.add("visible"));
}

// Contact form: client-side validation only (no backend in this demo)
const form = document.getElementById("contact-form");
const status = document.getElementById("form-status");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const message = form.message.value.trim();

  if (!name || !email || !message) {
    status.textContent = "Please fill in all fields.";
    status.classList.add("error");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    status.textContent = "Please enter a valid email address.";
    status.classList.add("error");
    return;
  }

  status.classList.remove("error");
  status.textContent = `Thanks, ${name}! Aarav will get back to you soon.`;
  form.reset();
});
