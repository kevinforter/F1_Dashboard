document.addEventListener('DOMContentLoaded', () => {
    // Highlight active nav link
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-links a');
    
    navLinks.forEach(link => {
        // Simple check if the link's href is in the current path
        if (currentPath.includes(link.getAttribute('href'))) {
            // Remove active from all
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        }
    });

    console.log('F1 Dashboard initialized.');
});
