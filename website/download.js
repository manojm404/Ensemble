document.querySelectorAll('.download-trigger').forEach(button => {
    button.addEventListener('click', (e) => {
        const os = e.currentTarget.dataset.os;
        const filename = os === 'mac' ? 'Ensemble-1.0.0.dmg' : 'Ensemble-1.0.0.exe';
        
        // Visual feedback
        const originalText = button.textContent;
        button.textContent = 'Preparing Download...';
        button.disabled = true;
        button.style.opacity = '0.7';

        setTimeout(() => {
            button.textContent = 'Starting Download...';
            
            // In a real V1, we would redirect to the actual binary:
            // window.location.href = `https://github.com/manojm404/Ensemble/releases/download/v1.0.0/${filename}`;
            
            // For this demo, let's just show a success state
            setTimeout(() => {
                button.textContent = `Download Started!`;
                button.style.background = 'linear-gradient(135deg, #10b981, #3b82f6)';
                
                alert(`🚀 Ensemble V1.0.0 Release:\n\nIn a production environment, this would initiate the download of ${filename}.\n\nYour desktop app is ready for deployment.`);
                
                setTimeout(() => {
                    button.textContent = originalText;
                    button.disabled = false;
                    button.style.opacity = '1';
                    button.style.background = '';
                }, 3000);
            }, 1000);
        }, 1500);
    });
});

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    });
});
