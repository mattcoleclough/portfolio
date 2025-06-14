// Add a global flag to track mouse button state
let globalIsMouseDown = false;
const VIMEO_VIDEO_ID = '1091328822'; // <<<< SET YOUR VIMEO VIDEO ID HERE

document.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left mouse button
        globalIsMouseDown = true;
    }
});

document.addEventListener('mouseup', () => {
    globalIsMouseDown = false;
});

document.addEventListener('DOMContentLoaded', () => {
    const mainContentWrapper = document.getElementById('main-content-wrapper');

    const SCROLL_DAMPENING_FACTOR = 0.25;

    const INERTIAL_SCROLL_DAMPING_FACTOR = 0.94; // How quickly velocity decays (0.9 to 0.95 is common). Higher = glides longer.
    const MIN_VELOCITY_TO_INITIATE_FLING = 0.1; // Minimum swipe velocity (pixels/ms) to trigger a fling.
    const MIN_FLING_VELOCITY_THRESHOLD = 0.00; // Velocity (pixels/ms) below which the fling animation stops.

    // --- Tunable Variable for Contact Heading Alignment ---
     
    let finalScrollTargetY = 0; // This will now be the single source of truth
    let isInitialLoad = true; // Flag to handle the first page load differently from resizes

    let canShowControlsOnInitialMove = false; // Flag to control initial showing via mousemove
    let isMouseOverPlayPauseButton = false;
    let isMouseOverMuteUnmuteButton = false;
    let isMouseOverFullscreenButton = false;

    let currentLayoutMode = 'desktop_mouse'; // Default (existing desktop version)

    setTimeout(() => {
        canShowControlsOnInitialMove = true;
    }, 2000); // 2000ms delay, can be adjusted

    let isUserTouching = false; // Flag to track if a finger is on the screen

    mainContentWrapper.addEventListener('touchstart', () => {
        isUserTouching = true;
        // When a new touch starts, cancel any pending smooth scroll correction.
        clearTimeout(scrollCorrectionTimeout);
    }, { passive: true });

    mainContentWrapper.addEventListener('touchend', () => {
        isUserTouching = false;
        // After the user lifts their finger, check if we need to apply the soft correction.
        // Use a minimal timeout to allow the final scroll position to settle.
        setTimeout(checkAndCorrectScrollPosition, 50); 
    });
    mainContentWrapper.addEventListener('touchcancel', () => {
        isUserTouching = false;
        setTimeout(checkAndCorrectScrollPosition, 50);
    });

    // Select all scroll containers for cursor logic (needs to be available globally)
    const scrollContainers = document.querySelectorAll('.film-scroll-container');
    const cursorHideTimeouts = new Map(); 
    const bumpedModulesOnDesktop = new Set();

    // Custom Smooth Scroll Function
    const customSmoothScroll = (targetY, duration, callback) => {
        const startY = mainContentWrapper.scrollTop; 
        const distance = targetY - startY;
        let startTime = null;

        const animateScroll = (currentTime) => {
            if (startTime === null) startTime = currentTime;
            const timeElapsed = currentTime - startTime;
            const progress = Math.min(timeElapsed / duration, 1); 
            const easeOutCubic = (t) => (--t) * t * t + 1; 
            mainContentWrapper.scrollTop = startY + distance * easeOutCubic(progress); 
            if (timeElapsed < duration) {
                requestAnimationFrame(animateScroll);
            } else if (callback) {
                callback(); 
            }
        };
        requestAnimationFrame(animateScroll);
    };

    function bumpScroll(container) {
        // Ensure this animation only runs on touch devices
        
        const isMobile = (currentLayoutMode === 'phone_portrait_touch')
        const isMixedTouch = (currentLayoutMode === 'mixed_touch')
        const isDesktop = (currentLayoutMode === 'desktop_mouse')
        const bumpDuration = 600; // Duration of the scroll out animation
        const returnDuration = 600; // Duration of the scroll back animation
        const pauseDuration = 150; // How long to pause at the peak

        const bumpDistanceMobile = 10; // How far to scroll out in pixels
        const bumpDistanceMixedTouch = 50; // How far to scroll out in pixels
        const bumpDistanceLargeTablet = 60;
        const bumpDistanceDesktop = 60;

        let bumpDistance;
        if (isDesktop) {
            bumpDistance = bumpDistanceDesktop;
        } else if (isMixedTouch) {
            bumpDistance = bumpDistanceMixedTouch;
        } else if (isMobile) {
            bumpDistance = bumpDistanceMobile;
        } else {
            bumpDistance = bumpDistanceLargeTablet;
        }

        let startTime = null;

        function animate(currentTime) {
            if (startTime === null) startTime = currentTime;
            const elapsedTime = currentTime - startTime;

            if (elapsedTime < bumpDuration) {
                // Phase 1: Scroll out
                const progress = elapsedTime / bumpDuration;
                container.scrollLeft = progress * bumpDistance;
                requestAnimationFrame(animate);
            } else if (elapsedTime < bumpDuration + pauseDuration) {
                // Phase 2: Pause at the peak
                container.scrollLeft = bumpDistance;
                requestAnimationFrame(animate);
            } else if (elapsedTime < bumpDuration + pauseDuration + returnDuration) {
                // Phase 3: Scroll back
                const returnProgress = (elapsedTime - bumpDuration - pauseDuration) / returnDuration;
                container.scrollLeft = bumpDistance * (1 - returnProgress);
                requestAnimationFrame(animate);
            } else {
                // Animation complete
                container.scrollLeft = 0;
            }
        }
        requestAnimationFrame(animate);
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    // Helper function for dynamic scroll cursor
    function updateScrollCursor(container, moduleInstance, isDraggingActive = false) { 
        const scrollLeft = container.scrollLeft;
        const alignmentScrollPoint = moduleInstance.getMaxScroll(); 
        const tolerancePx = 5; 
        const toleranceLeftEdge = 5; 

        container.classList.remove('cursor-scroll-right', 'cursor-scroll-left', 'cursor-scroll-bidirectional', 'cursor-grabbing');

        if (container.scrollWidth <= container.clientWidth + tolerancePx) { 
                container.classList.remove('active-cursor'); 
                return;
        }

        const isMouseCurrentlyOverContainer = container.classList.contains('active-cursor');

        if (isDraggingActive && isMouseCurrentlyOverContainer) {
            container.classList.add('cursor-grabbing');
        } else if (isMouseCurrentlyOverContainer) {
            let cursorClass = '';
            if (scrollLeft >= alignmentScrollPoint - tolerancePx) {
                cursorClass = 'cursor-scroll-left'; 
            } else if (scrollLeft <= toleranceLeftEdge) { 
                cursorClass = 'cursor-scroll-right'; 
            } else {
                cursorClass = 'cursor-scroll-bidirectional'; 
            }
            container.classList.add(cursorClass);
        }
    }

    function updateScrollShadows(container) { // 'container' is the .film-scroll-container
        if (!container) return;
        
        const wrapper = container.parentElement; // Get the new .scroll-shadow-wrapper
        if (!wrapper) return;

        const { scrollLeft, scrollWidth, clientWidth } = container;
        const scrollEndTolerance = 1; 

        // Add/remove class on the WRAPPER, based on the container's scroll
        wrapper.classList.toggle('show-left-shadow', scrollLeft > scrollEndTolerance);
        wrapper.classList.toggle('show-right-shadow', scrollWidth - scrollLeft - clientWidth > scrollEndTolerance);
    }

    // --- Reusable function to set up each scrollable film module ---
    function setupFilmScrollModule(containerElement, thirdImageElement) { 
        if (!containerElement) { 
            console.error("setupFilmScrollModule: containerElement is null. Aborting setup for this module.");
            return { 
                calculateLimits: () => {},
                container: null,
                getMinScroll: () => 0,
                getMaxScroll: () => 0,
                getIsDragging: () => false
            };
        }

        let minScrollLeftLimit = 0;
        let maxPhysicalScrollLimit = 0; 

        let isDragging = false; 
        let startX;  
        let dragstartX = 0; //X position when dragging starts
        let initialScrollLeftOnDragStart; //Initial scrollLeft when dragging starts         
        let initialScrollLeft; 
        let isMobile;

        let touchStartY = 0; 
        let isScrollDirectionLocked = false; // Prevents changing direction mid-swipe
        let isHorizontalScroll = false;      // True if we've decided this is a horizontal swipe

        // For fling physics
        let velocityX = 0;
        let lastMoveX = 0;
        let lastMoveTime = 0;
        let flingAnimationId = null;

        const calculateScrollLimits = () => {
            const remToPxRatio = parseFloat(getComputedStyle(document.documentElement).fontSize);
            const isMobile = (currentLayoutMode === 'phone_portrait_touch' || currentLayoutMode === 'mixed_touch');
            
            let targetMaxScrollRem;
            if (isMobile) {
                targetMaxScrollRem = 1351.2; // New mobile max scroll
            } else {
                targetMaxScrollRem = 486.9;  // Existing desktop max scroll
            }
            
            const desiredScrollLeft = targetMaxScrollRem * remToPxRatio;
            maxPhysicalScrollLimit = Math.max(0, desiredScrollLeft);
            
            const browserMaxScroll = containerElement.scrollWidth - containerElement.clientWidth;
            maxPhysicalScrollLimit = Math.min(maxPhysicalScrollLimit, browserMaxScroll);
            maxPhysicalScrollLimit = Math.max(0, maxPhysicalScrollLimit); 
        };
        
        calculateScrollLimits();
        containerElement.scrollLeft = minScrollLeftLimit; 

        const moduleInstance = {
            calculateLimits: calculateScrollLimits,
            container: containerElement,
            getMinScroll: () => minScrollLeftLimit,
            getMaxScroll: () => maxPhysicalScrollLimit,
            getIsDragging: () => isDragging 
        };

        const startDrag = (clientX, clientY) => {
            isDragging = true;
            dragStartX = clientX;
            touchStartY = clientY; // Store starting Y position for touch
            initialScrollLeftOnDragStart = containerElement.scrollLeft;
            velocityX = 0;
            lastMoveX = clientX;
            lastMoveTime = performance.now();
            isScrollDirectionLocked = false; // Reset direction lock on new touch/drag
            isHorizontalScroll = false; 
            if (flingAnimationId) {
                cancelAnimationFrame(flingAnimationId); // Stop any existing fling
                flingAnimationId = null;
            }
        };

        const duringDrag = (clientX, clientY, e) => {
            if (!isDragging) return;
            if (!isScrollDirectionLocked) {
                const deltaX = Math.abs(clientX - dragStartX);
                const deltaY = Math.abs(clientY - touchStartY);
                const directionLockThreshold = 5; // Pixels to move before locking direction

                if (deltaX > directionLockThreshold || deltaY > directionLockThreshold) {
                    if (deltaX > deltaY) {
                        isHorizontalScroll = true; // Movement is mostly horizontal
                    } else {
                        isHorizontalScroll = false; // Movement is mostly vertical
                    }
                    isScrollDirectionLocked = true;
                }
            }

            // If we've determined this is a vertical scroll, do nothing and allow default browser scroll
            if (!isHorizontalScroll) {
                return;
            }

            // If we are here, it's a confirmed horizontal scroll, so prevent vertical page scrolling.
            if (e && typeof e.preventDefault === 'function') {
                e.preventDefault(); 
            }

            const currentTime = performance.now();
            const deltaTime = currentTime - lastMoveTime;
            const deltaX = clientX - lastMoveX;

            if (deltaTime > 0) {
                velocityX = deltaX / deltaTime; // Calculate velocity (px/ms)
            }

            lastMoveX = clientX;
            lastMoveTime = currentTime;

            // Direct 1:1 dragging (no dampening here)
            const walk = clientX - dragStartX;
            let newScrollLeft = initialScrollLeftOnDragStart - walk;
            
            // Boundary checks during drag (optional, fling will also handle)
            // newScrollLeft = Math.max(minScrollLeftLimit, Math.min(maxPhysicalScrollLimit, newScrollLeft));
            containerElement.scrollLeft = newScrollLeft;
        };

        const endDrag = () => {
            if (!isDragging) return;
            isDragging = false;

            if (!isHorizontalScroll) return;

            // Start fling animation if velocity is significant
            if (Math.abs(velocityX) > MIN_VELOCITY_TO_INITIATE_FLING) {
                let currentVelocity = velocityX;
                let lastFlingTime = performance.now();

                const fling = (now) => {
                    const dt = now - lastFlingTime;
                    if (dt <= 0) { // Ensure time has passed
                        flingAnimationId = requestAnimationFrame(fling);
                        return;
                    }
                    lastFlingTime = now;

                    const scrollAmount = currentVelocity * dt;
                    let newScrollLeft = containerElement.scrollLeft - scrollAmount;

                    // Apply dampening to velocity for next frame
                    currentVelocity *= Math.pow(INERTIAL_SCROLL_DAMPING_FACTOR, dt / 16.67); // Apply damping based on typical frame time

                    // Boundary checks and stop conditions
                    if (newScrollLeft < minScrollLeftLimit) {
                        newScrollLeft = minScrollLeftLimit;
                        currentVelocity = 0; // Stop at boundary
                    } else if (newScrollLeft > maxPhysicalScrollLimit) {
                        newScrollLeft = maxPhysicalScrollLimit;
                        currentVelocity = 0; // Stop at boundary
                    }
                    containerElement.scrollLeft = newScrollLeft;

                    if (Math.abs(currentVelocity) > MIN_FLING_VELOCITY_THRESHOLD) {
                        flingAnimationId = requestAnimationFrame(fling);
                    } else {
                        flingAnimationId = null;
                        // console.log("Fling animation ended.");
                    }
                };
                flingAnimationId = requestAnimationFrame(fling);
            }
        };

        // Mouse Event Handlers
        containerElement.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left mouse button
                // Do not initiate mouse drag if it might be a touch event starting
                if (e.pointerType === 'touch' && e.pointerType !== undefined) return; // Check pointerType if available

                startDrag(e.pageX, e.pageY);
                e.preventDefault(); // Prevent text selection
                updateScrollCursor(containerElement, moduleInstance, true); // For mouse cursor
                document.addEventListener('mousemove', onGlobalMouseMove);
                document.addEventListener('mouseup', onGlobalMouseUp);
            }
        });

        const onGlobalMouseMove = (e) => {
            isScrollDirectionLocked = true; // For mouse, it's always horizontal
            isHorizontalScroll = true;
            duringDrag(e.pageX, e.pageY, e);
            // For mouse, also check if it left the container to stop drag (optional, or rely on mouseup)
            // updateScrollCursor(containerElement, moduleInstance, true); // Redundant if duringDrag updates
        };

        const onGlobalMouseUp = () => {
            endDrag();
            updateScrollCursor(containerElement, moduleInstance, false); // For mouse cursor
            document.removeEventListener('mousemove', onGlobalMouseMove);
            document.removeEventListener('mouseup', onGlobalMouseUp);
        };

        // Touch Event Handlers
        containerElement.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                startDrag(e.touches[0].pageX, e.touches[0].pageY); // Pass both X and Y
                document.addEventListener('touchmove', onGlobalTouchMove, { passive: false }); 
                document.addEventListener('touchend', onGlobalTouchEnd);
                document.addEventListener('touchcancel', onGlobalTouchEnd);
            }
        }, { passive: true }); 

        const onGlobalTouchMove = (e) => {
            if (isDragging && e.touches.length === 1) {
                duringDrag(e.touches[0].pageX, e.touches[0].pageY, e);
            }
        };

        const onGlobalTouchEnd = () => {
            endDrag();
            document.removeEventListener('touchmove', onGlobalTouchMove);
            document.removeEventListener('touchend', onGlobalTouchEnd);
            document.removeEventListener('touchcancel', onGlobalTouchEnd);
        };

        // --- Existing mouse wheel and cursor hover logic from your canvas ---
        containerElement.addEventListener('mouseenter', () => {
            // Only run in desktop mode and only if this module hasn't been bumped yet.
            if ((currentLayoutMode === 'desktop_mouse') && !bumpedModulesOnDesktop.has(containerElement)) {
                bumpScroll(containerElement);
                bumpedModulesOnDesktop.add(containerElement); // Mark this module as bumped so it doesn't run again.
            }
        });

        containerElement.addEventListener('wheel', (e) => {
            if (currentLayoutMode === 'desktop_mouse' || currentLayoutMode === 'desktop_layout_on_large_touch') {
                const deltaX = e.deltaX; const deltaY = e.deltaY;
                if (Math.abs(deltaX) > Math.abs(deltaY) || (deltaX !== 0 && deltaY === 0)) {
                    e.preventDefault();
                    let effectiveDelta = deltaX * SCROLL_DAMPENING_FACTOR; // SCROLL_DAMPENING_FACTOR is for mouse wheel
                    let newScrollLeft = containerElement.scrollLeft + effectiveDelta;
                    newScrollLeft = Math.max(minScrollLeftLimit, Math.min(maxPhysicalScrollLimit, newScrollLeft));
                    containerElement.scrollLeft = newScrollLeft;
                }
            }
        });
        containerElement.addEventListener('mouseenter', () => {
            if (currentLayoutMode === 'desktop_mouse' || currentLayoutMode === 'desktop_layout_on_large_touch') {
                if (cursorHideTimeouts.has(containerElement)) { clearTimeout(cursorHideTimeouts.get(containerElement)); cursorHideTimeouts.delete(containerElement); }
                containerElement.classList.add('active-cursor');
                updateScrollCursor(containerElement, moduleInstance, isDragging);
            }
        });
        containerElement.addEventListener('mouseleave', () => {
            if (currentLayoutMode === 'desktop_mouse' || currentLayoutMode === 'desktop_layout_on_large_touch') {
                if (!globalIsMouseDown) {
                    if (cursorHideTimeouts.has(containerElement)) { clearTimeout(cursorHideTimeouts.get(containerElement)); cursorHideTimeouts.delete(containerElement); }
                    containerElement.classList.remove('active-cursor', 'cursor-scroll-right', 'cursor-scroll-left', 'cursor-scroll-bidirectional', 'cursor-grabbing');
                }
            }
        });
        containerElement.addEventListener('scroll', () => {
            if (currentLayoutMode === 'desktop_mouse' || currentLayoutMode === 'desktop_layout_on_large_touch') {
                updateScrollCursor(containerElement, moduleInstance, isDragging);
            }
        });
        
        containerElement.addEventListener('scroll', () => {
            updateScrollShadows(containerElement);
            updateParallaxTitles(containerElement); // Call the new function on scroll
        });

        return moduleInstance;
    }

    // Initialize all film scroll modules and store their instances
    const filmsScrollContainer1 = document.getElementById('filmsScrollContainer');
    const image3_1 = filmsScrollContainer1 ? filmsScrollContainer1.querySelector('img:nth-child(5)') : null;

    const filmsScrollContainer2 = document.getElementById('filmsScrollContainer-module2');
    const image3_2 = filmsScrollContainer2 ? filmsScrollContainer2.querySelector('img:nth-child(5)') : null;

    const filmsScrollContainer3 = document.getElementById('filmsScrollContainer-module3');
    const image3_3 = filmsScrollContainer3 ? filmsScrollContainer3.querySelector('img:nth-child(5)') : null;

    const filmsScrollContainer4 = document.getElementById('filmsScrollContainer-module4');
    const image3_4 = filmsScrollContainer4 ? filmsScrollContainer4.querySelector('img:nth-child(5)') : null;

    if (!filmsScrollContainer1 || 
        !filmsScrollContainer2 || 
        !filmsScrollContainer3 || 
        !filmsScrollContainer4) { 
        console.error("One or more film scroll container elements not found. Please check the HTML structure and selectors.");
        return; 
    }
    
    const scrollModules = [];
    scrollModules.push(setupFilmScrollModule(filmsScrollContainer1, image3_1));
    scrollModules.push(setupFilmScrollModule(filmsScrollContainer2, image3_2));
    scrollModules.push(setupFilmScrollModule(filmsScrollContainer3, image3_3));
    scrollModules.push(setupFilmScrollModule(filmsScrollContainer4, image3_4));


    // Initial setup for cursor and mouse events for all containers
    scrollContainers.forEach((container, index) => { 
        const moduleInstance = scrollModules[index]; 
        if (moduleInstance && typeof moduleInstance.getMaxScroll === 'function') { 
            updateScrollCursor(container, moduleInstance, false); 
            
            container.addEventListener('mouseenter', () => {
                if (cursorHideTimeouts.has(container)) {
                    clearTimeout(cursorHideTimeouts.get(container));
                    cursorHideTimeouts.delete(container);
                }
                container.classList.add('active-cursor'); 
                updateScrollCursor(container, moduleInstance, moduleInstance.getIsDragging()); 
            });

            container.addEventListener('mouseleave', () => {
                if (!globalIsMouseDown) { 
                    if (cursorHideTimeouts.has(container)) {
                        clearTimeout(cursorHideTimeouts.get(container));
                        cursorHideTimeouts.delete(container);
                    }
                    container.classList.remove('active-cursor', 'cursor-scroll-right', 'cursor-scroll-left', 'cursor-scroll-bidirectional', 'cursor-grabbing');
                }
            });
        }
    });

    // --- Intersection Observer for Scroll Bump Animation ---
    if ('IntersectionObserver' in window) {
        const observerOptions = {
            root: mainContentWrapper, // Use the main scrollable area as the viewport
            rootMargin: '0px',
            threshold: 0.95 // Trigger when 95% of the module is visible
        };

        const observer = new IntersectionObserver((entries, observer) => {
            if (currentLayoutMode === 'desktop_mouse') {
                return;
            }
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const container = entry.target.querySelector('.film-scroll-container');
                    if (container) {
                        // Animate the bump and then stop observing this element
                        bumpScroll(container);
                        observer.unobserve(entry.target);
                    }
                }
            });
        }, observerOptions);

        // Start observing each film module's wrapper
        document.querySelectorAll('.scroll-shadow-wrapper').forEach(wrapper => {
            observer.observe(wrapper);
        });
    } else {
        console.warn("IntersectionObserver not supported, scroll bump animation will not run.");
    }

    function updateParallaxTitles(container) {
        // This function will only run for desktop and mixed-touch layouts
        const remToPxRatio = parseFloat(getComputedStyle(document.documentElement).fontSize);

        // Get the parent wrapper and the title/year elements within it
        const wrapper = container.parentElement.parentElement; // .film-scroll-container -> .scroll-shadow-wrapper -> .films-section-wrapper
        if (!wrapper) return;

        const title = wrapper.querySelector('[id^="title-text-module"], #title-text-module1');
        const year = wrapper.querySelector('[id^="year-text-module"], #year-text-module1');
        const thirdImage = container.querySelector('picture:nth-of-type(3) img');

        // --- VERTICAL POSITIONING ---
        const scrollContainer = wrapper.querySelector('.film-scroll-container');

        const desktopVerticalOffsetRem = 4.5;
        const mobileVerticalOffsetRem = 10;
        const mixedTouchVerticalOffsetRem = 5;

        const imageRect = scrollContainer.getBoundingClientRect(); // The top of the image container is our vertical reference
        const wrapperRect = wrapper.getBoundingClientRect();
        const imageTopRelativeToWrapper = imageRect.bottom - wrapperRect.top;
        
        const verticalOffsetPx = ((currentLayoutMode === 'phone_portrait_touch') ? mobileVerticalOffsetRem : desktopVerticalOffsetRem) * remToPxRatio;
        const mixedTouchVerticalOffsetPx = mixedTouchVerticalOffsetRem * remToPxRatio;
        const verticalOffsetPx2 = (currentLayoutMode === 'mixed_touch') ? mixedTouchVerticalOffsetPx : verticalOffsetPx;
        const newTopPx = imageTopRelativeToWrapper + verticalOffsetPx2;

        title.style.top = `${newTopPx}px`;
        year.style.top = `${newTopPx}px`;

        if (!title || !year || !thirdImage) return;

        if (currentLayoutMode === 'phone_portrait_touch') {
            title.style.left = (30 * remToPxRatio) + 'px'; // Reset styles if needed      
            year.style.right = (-95 * remToPxRatio) + 'px'; // Reset styles if needed
            // On phone portrait, we don't apply this effect.
            // (You could also use this to reset styles if needed)
            
        } else {

        // --- Define Start and End Points in Rem ---
        const titleStartLeftRemDesktop = 9;
        const yearStartRightRemDesktop = 129.3;
        const totalDistanceRemDesktop = 111.3; // Total distance the title moves left

        const titleStartLeftRem = (currentLayoutMode === 'mixed_touch') ? 45 : titleStartLeftRemDesktop; // Adjust for mixed touch
        const yearStartRightRem = (currentLayoutMode === 'mixed_touch') ? 50 : yearStartRightRemDesktop; // Adjust for mixed touch
        const totalDistanceRem = (currentLayoutMode === 'mixed_touch') ? 146 : totalDistanceRemDesktop; // Adjust for mixed touch


        // Calculate the end position for the year text
        const thirdImageRect = thirdImage.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        // The end position is the right edge of the 3rd image relative to the container's right edge
        const yearEndRightPx = containerRect.right - thirdImageRect.right;

        // --- Calculate Scroll Progress ---
        const { scrollLeft } = container;
        // The maximum scroll limit is already calculated and stored in the module
        const module = scrollModules.find(m => m.container === container);
        const maxScroll = module ? module.getMaxScroll() : (container.scrollWidth - container.clientWidth);
        const scrollProgress = maxScroll > 0 ? (scrollLeft / maxScroll) : 0;

        // --- Interpolate Positions ---
        // The title moves from 9rem left to 0rem left (it moves left by 9rem)
        const currentTitleLeftPx = (titleStartLeftRem + (totalDistanceRem * scrollProgress)) * remToPxRatio;

        // The year moves from 129.3rem right to its end position
        const currentYearRightPx = (yearStartRightRem - (totalDistanceRem * scrollProgress)) * remToPxRatio;

        // --- Apply Styles ---
        title.style.left = `${currentTitleLeftPx}px`;
        year.style.right = `${currentYearRightPx}px`;
        }
    }

        // NEW: Function to handle responsive sizing within film modules
        function applyResponsiveFilmStripLayout() {
        const isMobile = (currentLayoutMode === 'phone_portrait_touch');
        const isMixedTouch = (currentLayoutMode === 'mixed_touch');
        const remToPxRatio = parseFloat(getComputedStyle(document.documentElement).fontSize);

        // ... (your rem to px calculations are correct)

        document.querySelectorAll('.film-scroll-container').forEach(container => {
            // --- FIX #1: Only apply dynamic width on touch modes ---
            if (isMobile || isMixedTouch) {
                const containerRect = container.getBoundingClientRect();
                const containerLeft = containerRect.left;
                const newWidth = window.innerWidth - containerLeft;
                container.style.width = newWidth + 'px';
            } else {
                // On desktop, revert to CSS-defined width
                container.style.width = ''; 
            }

            // --- FIX #2: Select '<picture>' instead of '<img>' ---
            const contentElements = container.querySelectorAll('picture, div:not(.film-strip-spacer):not([style*="width: 1px"])');
            
            contentElements.forEach(el => {
                if (isMobile) {
                    if (el.tagName.toLowerCase() === 'picture') {
                        // This code will now run correctly
                        el.style.width = mobileImageWidthPx + 'px';
                        if (el.parentElement.id.endsWith('-module4')) { // Check parent container ID
                            el.style.height = mobileImageWidthPx / 2.35 + 'px';
                        } else {
                            el.style.height = mobileImageWidthPx / 1.85 + 'px';
                        }
                    } else { 
                        el.style.width = mobileTextBlockWidthPx + 'px';
                        el.style.marginLeft = mobileGapPx + 'px';
                        el.style.marginRight = mobileGapPx + 'px';
                    }
                } else if (isMixedTouch) {
                    if (el.tagName.toLowerCase() === 'picture') {
                        // This code will also now run correctly
                        el.style.width = mixedTouchImageWidthPx + 'px';
                        if (el.parentElement.id.endsWith('-module4')) { // Check parent container ID
                            el.style.height = mixedTouchImageWidthPx / 2.35 + 'px';
                        } else {
                            el.style.height = mixedTouchImageWidthPx / 1.85 + 'px';
                        }
                    } else {
                        el.style.width = mixedTouchTextBlockWidthPx + 'px';
                        el.style.marginLeft = mixedTouchGapLeftPx + 'px';
                        el.style.marginRight = mixedTouchGapRightPx + 'px'; 
                    }                
                } else {
                    // This desktop logic remains correct
                    el.style.width = ''; 
                    el.style.marginLeft = '';
                    el.style.marginRight = ''; // Also clear marginRight for desktop
                    el.style.height = ''; // Also clear height for desktop
                }
            });
        });
    }
    
    // --- Constants for Layout Logic ---
    const LAYOUT_MIN_VIDEO_TOP_MARGIN_REM = 0.5;
    const LAYOUT_MIN_VIDEO_BOTTOM_MARGIN_REM = 9.02; 
    const LAYOUT_THRESHOLD_CASE1_MAX_REM = 230; // 227.4072rem is the threshold for Case 1
    const LAYOUT_THRESHOLD_CASE2_MAX_REM = 250;

    const LAYOUT_CASE2_EXCESS_BASE_REM = LAYOUT_THRESHOLD_CASE1_MAX_REM;
    const LAYOUT_CASE2_TOP_DISTRIBUTION = 1/4; 
    const LAYOUT_CASE2_BOTTOM_DISTRIBUTION = 3/4; 

    const LAYOUT_CASE3_EXCESS_BASE_REM = LAYOUT_THRESHOLD_CASE2_MAX_REM;
    const LAYOUT_CASE3_ABOUT_BOTTOM_OFFSET_REM = 3.3872;
    const LAYOUT_CASE3_VIDEO_TO_ABOUT_GAP_BASE_REM = 9.02;
    const LAYOUT_CASE3_VIDEO_ABOVE_EXCESS_RATIO = 1/2; 
    const LAYOUT_CASE3_VIDEO_TO_ABOUT_GAP_EXCESS_RATIO = 1/2;


    // --- Shared function to calculate video margins and initial scroll target ---
    function calculateDynamicLayoutAndScroll(elements) {
        // Ensure elements are passed or available if needed by desktop logic
        const { mainContentWrapper, videoShowreelSection, aboutHeadingElement } = elements || {}; 
        const remToPxRatio = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const vhPx = window.innerHeight;
        const vhRem = vhPx / remToPxRatio;

        const isMobile = (currentLayoutMode === 'phone_portrait_touch');
        const isMixedTouch = (currentLayoutMode === 'mixed_touch');

        if (currentLayoutMode === 'desktop_mouse' || currentLayoutMode === 'desktop_layout_on_large_touch') {  
            let marginTopPx = 0;
            let marginBottomPx = 0;
            let scrollTargetPx = 0;

            if (vhRem <= LAYOUT_THRESHOLD_CASE1_MAX_REM) {
                // Case 1
                console.log(vhRem, LAYOUT_THRESHOLD_CASE1_MAX_REM);
                marginTopPx = LAYOUT_MIN_VIDEO_TOP_MARGIN_REM * remToPxRatio;
                marginBottomPx = LAYOUT_MIN_VIDEO_BOTTOM_MARGIN_REM * remToPxRatio;
                
                const videoRect = videoShowreelSection.getBoundingClientRect();
                const videoCurrentActualMarginTopPx = parseFloat(getComputedStyle(videoShowreelSection).marginTop) || 0;
                const videoAbsoluteTopWithoutMargin = videoRect.top + mainContentWrapper.scrollTop - videoCurrentActualMarginTopPx;
                scrollTargetPx = videoAbsoluteTopWithoutMargin - marginTopPx;

            } else if (vhRem <= LAYOUT_THRESHOLD_CASE2_MAX_REM) {
                // Case 2
                console.log(vhRem, LAYOUT_THRESHOLD_CASE2_MAX_REM);
                const excessHeightRem = vhRem - LAYOUT_CASE2_EXCESS_BASE_REM;
                marginTopPx = (LAYOUT_MIN_VIDEO_TOP_MARGIN_REM + (excessHeightRem * LAYOUT_CASE2_TOP_DISTRIBUTION)) * remToPxRatio;
                marginBottomPx = (LAYOUT_MIN_VIDEO_BOTTOM_MARGIN_REM + (excessHeightRem * LAYOUT_CASE2_BOTTOM_DISTRIBUTION)) * remToPxRatio;

                const videoRect = videoShowreelSection.getBoundingClientRect();
                const videoCurrentActualMarginTopPx = parseFloat(getComputedStyle(videoShowreelSection).marginTop) || 0;
                const videoAbsoluteTopWithoutMargin = videoRect.top + mainContentWrapper.scrollTop - videoCurrentActualMarginTopPx;
                scrollTargetPx = videoAbsoluteTopWithoutMargin - marginTopPx;

            } else {
                // Case 3
                const aboutHeadingRect = aboutHeadingElement.getBoundingClientRect();
                const aboutBottomOffsetPx = LAYOUT_CASE3_ABOUT_BOTTOM_OFFSET_REM * remToPxRatio;
                const aboutHeadingAbsoluteBottom = aboutHeadingRect.bottom + mainContentWrapper.scrollTop;
                scrollTargetPx = aboutHeadingAbsoluteBottom - (vhPx - aboutBottomOffsetPx);

                const excessHeightRemCase3 = vhRem - LAYOUT_CASE3_EXCESS_BASE_REM;
                
                // Margin below video (gap to about heading)
                marginBottomPx = (LAYOUT_CASE3_VIDEO_TO_ABOUT_GAP_BASE_REM + (excessHeightRemCase3 * LAYOUT_CASE3_VIDEO_TO_ABOUT_GAP_EXCESS_RATIO)) * remToPxRatio;

                // Margin above video: calculated based on remaining space, with a minimum.
                const videoHeightPx = videoShowreelSection.offsetHeight;
                const aboutHeadingHeightPx = aboutHeadingElement.offsetHeight;
                const spaceOccupiedByAboutAndOffset = aboutHeadingHeightPx + aboutBottomOffsetPx;
                const spaceOccupiedByVideoAndItsBottomMargin = videoHeightPx + marginBottomPx;
                
                let calculatedTopMarginPx = vhPx - spaceOccupiedByVideoAndItsBottomMargin - spaceOccupiedByAboutAndOffset;
                const minTopMarginPx = LAYOUT_MIN_VIDEO_TOP_MARGIN_REM * remToPxRatio;
                marginTopPx = Math.max(minTopMarginPx, calculatedTopMarginPx);
            }

            return {
                marginTopPx: Math.max(0, marginTopPx),
                marginBottomPx: Math.max(0, marginBottomPx),
                scrollTargetPx: Math.max(0, scrollTargetPx)
            };
                } else if (isMobile) { // For 'mixed_touch', 'phone_portrait_touch', or any other non-desktop mode
                // console.log("calculateDynamicLayoutAndScroll: Using MOBILE/TOUCH logic (CSS handles video margins).");
                
                // For mobile/touch, JS does not change video margins; CSS defaults apply.
                // Return null for margins to signal no JS override.
                
                // Calculate a simple scrollTargetPx for mobile.
                // Video section has a CSS margin-top of 9rem (your planned mobile default).
                // Let's aim for 3rem headroom above the video section's top border (which includes its margin).
                let touchScrollTargetPx = 0;
                const videoRect = videoShowreelSection.getBoundingClientRect();
                const videoCurrentActualMarginTopPx = parseFloat(getComputedStyle(videoShowreelSection).marginTop) || 0;
                const videoAbsoluteTopWithoutMargin = videoRect.top + mainContentWrapper.scrollTop - videoCurrentActualMarginTopPx;

                if (videoShowreelSection) { // Ensure videoShowreelSection element is available
                    const mobileHeadroomRem = 85; // Desired space above the video section's top margin line
                    // videoShowreelSection.offsetTop includes its CSS-defined marginTop.
                    touchScrollTargetPx = videoAbsoluteTopWithoutMargin - (mobileHeadroomRem * remToPxRatio);
                    touchScrollTargetPx = Math.max(0, touchScrollTargetPx); // Ensure it's not negative
                } else {
                    // console.warn("calculateDynamicLayoutAndScroll (Mobile): videoShowreelSection not found for scroll target. Defaulting to 0.");
                    // If you have a default REM scroll target constant, you could use it here:
                    // mobileScrollTargetPx = DEFAULT_MOBILE_SCROLL_TARGET_Y_REM * remToPxRatio;
                    // For now, defaulting to 0 if section not found.
                }
                
                return {
                    marginTopPx: null,    // Signal: Do not apply JS-driven margin top
                    marginBottomPx: null, // Signal: Do not apply JS-driven margin bottom
                    scrollTargetPx: touchScrollTargetPx
                }
                
                } else if (isMixedTouch) {
                let mixedTouchScrollTargetPx = 0;
                const videoRect = videoShowreelSection.getBoundingClientRect();
                const videoCurrentActualMarginTopPx = parseFloat(getComputedStyle(videoShowreelSection).marginTop) || 0;
                const videoAbsoluteTopWithoutMargin = videoRect.top + mainContentWrapper.scrollTop - videoCurrentActualMarginTopPx;
                if (videoShowreelSection) { // Ensure videoShowreelSection element is available
                    const mixedTouchHeadroomRem = 10; // Desired space above the video section's top margin line
                    // videoShowreelSection.offsetTop includes its CSS-defined marginTop.
                    touchScrollTargetPx = videoAbsoluteTopWithoutMargin - (mixedTouchHeadroomRem * remToPxRatio);
                    touchScrollTargetPx = Math.max(0, touchScrollTargetPx); // Ensure it's not negative 
                
                } else {
                    // console.warn("calculateDynamicLayoutAndScroll (Mobile): videoShowreelSection not found for scroll target. Defaulting to 0.");
                    // If you have a default REM scroll target constant, you could use it here:
                    // mobileScrollTargetPx = DEFAULT_MOBILE_SCROLL_TARGET_Y_REM * remToPxRatio;
                    // For now, defaulting to 0 if section not found.
                }
                
                return {
                    marginTopPx: null,    // Signal: Do not apply JS-driven margin top
                    marginBottomPx: null, // Signal: Do not apply JS-driven margin bottom
                    scrollTargetPx: touchScrollTargetPx
                };
            }
        }


    // Layout Recalculation Handler (for resize and zoom)
    const handleLayoutRecalculation = () => {

        const scrollProgressMap = new Map();
        scrollModules.forEach(module => {
            const { container } = module;
            const maxScroll = module.getMaxScroll();
            if (maxScroll > 0) {
                const progress = container.scrollLeft / maxScroll;
                scrollProgressMap.set(container, progress);
            } else {
                scrollProgressMap.set(container, 0);
            }
        });

        // Video section margins
        const videoShowreelSection = document.getElementById('video-showreel-section');
        const aboutHeadingElementForLayout = document.getElementById('about-heading'); // Ensure it's defined
        const videoPlaceholderDiv = document.getElementById('video-placeholder-div');

        if (!isInitialLoad && videoShowreelSection) {
            // On resizes (not the first load), store the current scroll and margin values BEFORE changing anything.
            const scrollTopBeforeResize = mainContentWrapper.scrollTop;
            const styles = getComputedStyle(videoShowreelSection);
            const videoMarginBeforeResize = (parseFloat(styles.marginTop) || 0) + (parseFloat(styles.marginBottom) || 0);
        }

        applyResponsiveFilmStripLayout();

        // Film strip scroll limits
        scrollModules.forEach(module => {
            module.calculateLimits(); 

            const savedProgress = scrollProgressMap.get(module) || 0;
            const newMaxScroll = module.getMaxScroll();
            module.scrollLeft = newMaxScroll * savedProgress;


            const container = module.container;
            container.scrollLeft = Math.max(module.getMinScroll(), Math.min(module.getMaxScroll(), container.scrollLeft));
            updateScrollCursor(container, module, module.getIsDragging());
            //updateScrollShadows(module.container);
            //updateParallaxTitles(module.container);
        });
    
        //positionFilmModuleTitles();

        if (videoPlaceholderDiv) {
            const newWidth = videoPlaceholderDiv.offsetWidth;
            // The aspect ratio is 1.7778:1 (or 16:9)
            videoPlaceholderDiv.style.height = (newWidth / 1.7778) + 'px';
        }

        if (videoShowreelSection && aboutHeadingElementForLayout) {
            const layoutElements = {
                mainContentWrapper: mainContentWrapper,
                videoShowreelSection: videoShowreelSection,
                aboutHeadingElement: aboutHeadingElementForLayout
            };
            const { marginTopPx, marginBottomPx, scrollTargetPx } = calculateDynamicLayoutAndScroll(layoutElements);

            if (marginTopPx !== null) {
                    // This will only be true for desktop modes now
                    videoShowreelSection.style.marginTop = marginTopPx + 'px';
                    // console.log("JS applied marginTop:", marginTopPx + 'px');
                } else {
                    // This will be true for mobile/touch modes. Clear any inline style so CSS takes over.
                    videoShowreelSection.style.marginTop = '';
                    // console.log("JS cleared inline marginTop for mobile/touch.");
                }

                if (marginBottomPx !== null) {
                    // This will only be true for desktop modes
                    videoShowreelSection.style.marginBottom = marginBottomPx + 'px';
                    // console.log("JS applied marginBottom:", marginBottomPx + 'px');
                } else {
                    // This will be true for mobile/touch modes. Clear any inline style so CSS takes over.
                    videoShowreelSection.style.marginBottom = '';
                    // console.log("JS cleared inline marginBottom for mobile/touch.");
                }

            finalScrollTargetY = scrollTargetPx;

            if (isInitialLoad) {
                // On the very first load, snap to the calculated target
                mainContentWrapper.scrollTop = finalScrollTargetY;
                isInitialLoad = false; // Subsequent calls will be treated as resizes
            } else {
                // On resize, preserve scroll position relative to content shifts
                if (mainContentWrapper.scrollTop < finalScrollTargetY) {
                    mainContentWrapper.scrollTop = finalScrollTargetY;
                }
            } 

            console.log(`Layout recalculated. New scroll target: ${finalScrollTargetY.toFixed(0)}px. Current scroll: ${mainContentWrapper.scrollTop.toFixed(0)}px`);

        } else {
            console.warn("Video section or About heading not found for dynamic margin calculation in handleLayoutRecalculation.");
        }

        setTimeout(() => {
            // Fix video aspect ratio
            const videoPlaceholderDiv = document.getElementById('video-placeholder-div');
            if (videoPlaceholderDiv) {
                const newWidth = videoPlaceholderDiv.offsetWidth;
                videoPlaceholderDiv.style.height = (newWidth / 1.7778) + 'px';
            }

            // Reposition titles based on the now-stable layout
            scrollModules.forEach(module => {
                if (module.container) {
                    updateParallaxTitles(module.container); // This now reads correct positions
                    updateScrollShadows(module.container);
                }
            });
            console.log("Final layout calculations (video aspect ratio, title positions) have been applied.");
        }, 0);
    };

    let globalDesktopMouseMoveListener = null; 
    let videoOverlayDesktopMouseEnterListener = null;

    function setupNavigationInteractions() {
        // console.log("setupNavigationInteractions called for mode:", currentLayoutMode);
        const videoInteractionOverlay = document.getElementById('video-interaction-overlay');
        
        if (!videoInteractionOverlay) {
            console.error("Video interaction overlay not found for setting up navigation.");
            return;
        }
        

        // --- Clear ALL previous listeners controlled by this function ---
        if (globalDesktopMouseMoveListener && document) {
            document.removeEventListener('mousemove', globalDesktopMouseMoveListener);
            globalDesktopMouseMoveListener = null;
        }
        if (videoOverlayDesktopMouseEnterListener && videoInteractionOverlay) {
            videoInteractionOverlay.removeEventListener('mouseenter', videoOverlayDesktopMouseEnterListener);
            videoOverlayDesktopMouseEnterListener = null;
        }
        if (videoInteractionOverlay._tapListener) {
            videoInteractionOverlay.removeEventListener('click', videoInteractionOverlay._tapListener);
            delete videoInteractionOverlay._tapListener;
        }
        // --- End Clear previous listeners ---

        if (currentLayoutMode === 'desktop_mouse') {
            // console.log("Setting up MOUSE-based triggers for video controls.");
            globalDesktopMouseMoveListener = function onDesktopMouseMoveForControls() {
                if (vimeoPlayer && typeof vimeoPlayer.getPaused === 'function') {
                    if (!hasUserMovedMouse) hasUserMovedMouse = true;
                    if (canShowControlsOnInitialMove && typeof showVideoControls === 'function') {
                        showVideoControls();
                    }
                }
            };
            if (document) document.addEventListener('mousemove', globalDesktopMouseMoveListener);

            videoOverlayDesktopMouseEnterListener = () => {
                if (vimeoPlayer && canShowControlsOnInitialMove && typeof showVideoControls === 'function') {
                    showVideoControls();
                }
            };
            videoInteractionOverlay.addEventListener('mouseenter', videoOverlayDesktopMouseEnterListener);

        } else { // Touch-primary modes ('large desktop tablet', 'mixed_touch', 'phone_portrait_touch')
            // console.log("Setting up TAP-based triggers for video controls.");
            const tapListener = () => {
                // We only want this logic to run after the initial page fade-in is complete.
                if (!fadeTransitionFired) return;

                setTimeout (500);

                const playPauseBtn = document.getElementById('custom-play-pause-button');
                const muteBtn = document.getElementById('custom-mute-unmute-button');
                const fullscreenBtn = document.getElementById('custom-fullscreen-button');

                // Check if the controls are currently visible
                if (playPauseBtn && playPauseBtn.classList.contains('visible-control')) {
                    // --- NEW LOGIC: Controls are visible, so hide them quickly ---
                    
                    // Clear any existing longer fade-out timer from a previous interaction.
                    clearTimeout(videoControlsFadeTimeout);

                    // Set a new, short timer to hide the controls.
                    videoControlsFadeTimeout = setTimeout(() => {
                        if (playPauseBtn) playPauseBtn.classList.remove('visible-control');
                        if (muteBtn) muteBtn.classList.remove('visible-control');
                        if (fullscreenBtn) fullscreenBtn.classList.remove('visible-control');
                    }, 100); // 100ms for a quick fade-out.

                } else {
                    // --- ORIGINAL LOGIC: Controls are hidden, so show them ---
                    if (typeof showVideoControls === 'function') {
                        showVideoControls();
                    }
                }
            };
            videoInteractionOverlay.addEventListener('click', tapListener);
            videoInteractionOverlay._tapListener = tapListener;
        }
    }

    // --- START: Capability & Layout Mode Detection ---

    // Define your width thresholds (these can be tuned)
    const DESKTOP_LAYOUT_MIN_WIDTH_FOR_TOUCH_LANDSCAPE = 992; // If a touch device in landscape is this wide or wider, use desktop layout
    const PHONE_PORTRAIT_MAX_WIDTH = 600;                     // Max width for 'phone_portrait_touch'
    const MIXED_TOUCH_MAX_WIDTH = 991;                        // Max width for 'mixed_touch' (covers smaller phone landscape & tablet portrait)

    function getLayoutMode() {
        const isTouchPrimary = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
        const isLandscape = window.matchMedia("(orientation: landscape)").matches;
        const screenWidth = window.innerWidth;

        if (isTouchPrimary) {
            if (isLandscape && screenWidth >= DESKTOP_LAYOUT_MIN_WIDTH_FOR_TOUCH_LANDSCAPE) {
                return 'desktop_layout_on_large_touch'; // Large touch device, but use desktop layout logic
            } else if (isLandscape) { // Smaller Phone Landscape
                return 'mixed_touch';
            } else { // Portrait Orientation for Touch Devices
                if (screenWidth <= PHONE_PORTRAIT_MAX_WIDTH) {
                    return 'phone_portrait_touch';
                } else if (screenWidth <= MIXED_TOUCH_MAX_WIDTH) { // Tablet Portrait
                    return 'mixed_touch';
                } else {
                    // Fallback for larger touch portrait devices not covered above
                    // Defaulting to 'mixed_touch' or you could define another category
                    return 'mixed_touch'; 
                }
            }
        } else {
            return 'desktop_mouse'; // Non-touch primary, assume desktop with mouse
        }
    }

    function updateCurrentLayoutMode() {
        const newMode = getLayoutMode();
        if (newMode !== currentLayoutMode) {
            currentLayoutMode = newMode;
            console.log("Layout Mode Updated To:", currentLayoutMode); // For debugging

            // These functions will be fully defined/modified in later steps
            // For now, they will just call existing desktop logic or be stubs
            if (typeof handleLayoutRecalculation === 'function') {
                handleLayoutRecalculation();
            }
            if (typeof setupNavigationInteractions === 'function') {
                setupNavigationInteractions();
            } else {
                console.warn("setupNavigationInteractions function not yet defined.");
            }
        }
    }

    updateCurrentLayoutMode(); // Determine and set the initial layout mode
    setupNavigationInteractions(); // Setup navigation interactions based on the initial layout mode

    if(window) {
        window.addEventListener('resize', () => {
            console.log("EVENT: Resize event fired on window.");
            updateCurrentLayoutMode();
        });
        window.addEventListener('orientationchange', () => {
            console.log("EVENT: OrientationChange event fired on window.");
            updateCurrentLayoutMode();
        });
    }

    // --- END: Initialize Layout Mode and Add Listeners ---



    // --- Video Placeholder Interaction Logic, Initial Page Load, and Related Functions ---

    const videoInteractionOverlay = document.getElementById('video-interaction-overlay');
    const vimeoIframe = document.getElementById('vimeo-player-iframe');
    const customPlayPauseButton = document.getElementById('custom-play-pause-button');
    const customMuteUnmuteButton = document.getElementById('custom-mute-unmute-button');
    const customFullscreenButton = document.getElementById('custom-fullscreen-button');
    let vimeoPlayer;
    let isVideoMuted = true; 
    let isCustomVideoPlaying = true; 
    let videoControlsFadeTimeout;
    let hasUserMovedMouse = false;
    let muteStateBeforeFullscreen = null;

    let windowHasLoadedForFade = false;
    let isVimeoReadyAndPlayingForFade = !vimeoIframe; 
    let fadeInitiatedBySystem = false;
    let fadeTransitionFired = false; 
    
    const fadeOverlay = document.getElementById('fade-overlay'); 
    let initialLoadAndPositioningCompleted = false;

    function updatePlayPauseButton() {
        if (!customPlayPauseButton) return;

        if (isCustomVideoPlaying) { // Video is playing, button should show "Pause" action
            customPlayPauseButton.classList.remove('display-play-svg');
            customPlayPauseButton.classList.add('display-pause-svg');
            customPlayPauseButton.title = "Pause Video";
        } else { // Video is paused, button should show "Play" action
            customPlayPauseButton.classList.remove('display-pause-svg');
            customPlayPauseButton.classList.add('display-play-svg');
            customPlayPauseButton.title = "Play Video";
        }
    }

    function updateMuteUnmuteButton() {
        if (!customMuteUnmuteButton || !vimeoPlayer) { // Ensure elements are available
            // console.warn("updateMuteUnmuteButtonIcon: Button or player not found.");
            return;
        }

        // console.log("updateMuteUnmuteButtonIcon called. Current isVideoMuted:", isVideoMuted);
        if (isVideoMuted) { 
            // Video IS Muted, so the button's ACTION is to Unmute. Display UNMUTE icon.
            customMuteUnmuteButton.classList.remove('display-unmute-svg');
            customMuteUnmuteButton.classList.add('display-mute-svg');
            customMuteUnmuteButton.title = "Unmute Video"; 
        } else { 
            // Video IS Unmuted, so the button's ACTION is to Mute. Display MUTE icon.
            customMuteUnmuteButton.classList.remove('display-mute-svg');
            customMuteUnmuteButton.classList.add('display-unmute-svg');
            customMuteUnmuteButton.title = "Mute Video"; 
        }
    }

    function updateFullscreenButton() {
        if (!customFullscreenButton) { // Check if the button itself exists
            // console.log("updateFullscreenButton: Fullscreen button element not found.");
            return;
        }

        const videoContainer = document.getElementById('video-placeholder-div'); // THIS IS THE ELEMENT THAT GOES FULLSCREEN

        if (!videoContainer) {
            // console.log("updateFullscreenButton: video-placeholder-div not found.");
            return; // Can't determine state if container is missing
        }

        const isCurrentlyFullscreen = (
            document.fullscreenElement === videoContainer ||
            document.webkitFullscreenElement === videoContainer ||
            document.mozFullScreenElement === videoContainer || // Older Firefox
            document.msFullscreenElement === videoContainer
        );

        /* console.log("updateFullscreenButton CALLED. Is Fullscreen:", isCurrentlyFullscreen, 
                    "document.fullscreenElement:", document.fullscreenElement, 
                    "videoContainer:", videoContainer); */

        if (isCurrentlyFullscreen) {
            customFullscreenButton.classList.remove('display-fullscreen-svg');
            customFullscreenButton.classList.add('display-exit-fullscreen-svg');
            customFullscreenButton.title = "Exit Fullscreen";
            // console.log("updateFullscreenButton: Set to EXIT icon (display-exit-fullscreen-svg)");
        } else {
            customFullscreenButton.classList.remove('display-exit-fullscreen-svg');
            customFullscreenButton.classList.add('display-fullscreen-svg');
            customFullscreenButton.title = "Enter Fullscreen";
            // console.log("updateFullscreenButton: Set to ENTER icon (display-fullscreen-svg)");
        }
    }

    // showVideoControls function
    function showVideoControls() {
        if (!vimeoPlayer) return; 
        
        // Get the current visibility state BEFORE changing it
        const playPauseButtonWasPreviouslyHidden = !customPlayPauseButton.classList.contains('visible-control');
        const muteButtonWasPreviouslyHidden = !customMuteUnmuteButton.classList.contains('visible-control');
        const fullscreenButtonWasPreviouslyHidden = !customFullscreenButton.classList.contains('visible-control');

        // Show all controls
        if (customPlayPauseButton) customPlayPauseButton.classList.add('visible-control');
        if (customMuteUnmuteButton) customMuteUnmuteButton.classList.add('visible-control'); 
        if (customFullscreenButton) customFullscreenButton.classList.add('visible-control');

        // If a button just became visible, update its icon to the current state
        if (playPauseButtonWasPreviouslyHidden && typeof updatePlayPauseButton === 'function') {
            updatePlayPauseButton();
        }
        if (muteButtonWasPreviouslyHidden && typeof updateMuteUnmuteButton === 'function') {
            updateMuteUnmuteButton();
        }
        if (fullscreenButtonWasPreviouslyHidden && typeof updateFullscreenButton === 'function') {
            updateFullscreenButton();
        }

        clearTimeout(videoControlsFadeTimeout); 
        
        videoControlsFadeTimeout = setTimeout(() => {
            const isTouchMode = (currentLayoutMode === 'mixed_touch' || currentLayoutMode === 'phone_portrait_touch');

            // On touch devices, hide unconditionally after the timeout.
            // On desktop, only hide if the mouse is not currently hovering over a control.
            
            if (fadeTransitionFired && (isTouchMode || (!isMouseOverPlayPauseButton && !isMouseOverMuteUnmuteButton && !isMouseOverFullscreenButton))) {
                if (customPlayPauseButton) customPlayPauseButton.classList.remove('visible-control');
                if (customMuteUnmuteButton) customMuteUnmuteButton.classList.remove('visible-control'); 
                if (customFullscreenButton) customFullscreenButton.classList.remove('visible-control');
            }
        }, 2000); 
    }

    const updateVideoMuteState = () => {
        if (!vimeoPlayer) return;
        vimeoPlayer.getMuted().then(function(mutedValueFromPlayer) {
            // console.log(`updateVideoMuteState: vimeoPlayer.getMuted() resolved with: ${mutedValueFromPlayer}`);
            const oldIsVideoMuted = isVideoMuted;
            isVideoMuted = mutedValueFromPlayer;
            // console.log(`updateVideoMuteState: isVideoMuted is NOW: ${isVideoMuted}`);

            if (isMouseOverMuteUnmuteButton) {
                // If mouse IS over the button, the icon should display the ACTION for the NEW current state.
                // console.log("updateVideoMuteState: Mouse IS over mute button. Re-applying ACTION icon for new state (isVideoMuted = " + isVideoMuted + ").");
                // Update only if the state actually changed, to prevent unnecessary DOM manipulation if icon is already correct for hover.
                if (oldIsVideoMuted !== isVideoMuted) { 
                    if (isVideoMuted) { // Video IS Muted, ACTION is Unmute
                        customMuteUnmuteButton.classList.remove('display-mute-svg');
                        customMuteUnmuteButton.classList.add('display-unmute-svg');
                        customMuteUnmuteButton.title = "Click to Unmute";
                    } else { // Video IS Unmuted, ACTION is Mute
                        customMuteUnmuteButton.classList.remove('display-unmute-svg');
                        customMuteUnmuteButton.classList.add('display-mute-svg');
                        customMuteUnmuteButton.title = "Click to Mute";
                    }
                }
            } else {
                // If mouse is NOT over the button, then update the icon to reflect the true CURRENT state.
                // console.log("updateVideoMuteState: Mouse NOT over mute button. Calling updateMuteUnmuteButton.");
                if (typeof updateMuteUnmuteButton === 'function') {
                    updateMuteUnmuteButton();
                }
            }
        }).catch(function(error) {
            console.error('Error in updateVideoMuteState getting muted state:', error);
            if (typeof updateMuteUnmuteButton === 'function') { // Fallback
                updateMuteUnmuteButton();
            }
        });
    };

    function startFadeActualAnimation() {
        if (!fadeOverlay) {
            console.error("Fade overlay not found in startFadeActualAnimation");
            return;
        }
        console.log("Attempting to start fade-out animation of page overlay.");
        fadeOverlay.style.opacity = '0';
        fadeOverlay.style.pointerEvents = 'none'; 
        initialLoadAndPositioningCompleted = true; 
        console.log("Page overlay fade-up animation initiated. Page interactive.");

        setTimeout(() => {
            if (!fadeTransitionFired) {
                console.warn("Page overlay fade transitionend event did not fire. Forcing overlay removal.");
                if (fadeOverlay) fadeOverlay.style.display = 'none';
            }
        }, 3500); 
    }

    function checkAndStartAllSystemsGoFade() {
        if (windowHasLoadedForFade && isVimeoReadyAndPlayingForFade && !fadeInitiatedBySystem) {
            fadeInitiatedBySystem = true;
            console.log("All systems go: Window loaded and Vimeo ready/playing/timed-out. Starting page fade.");
            startFadeActualAnimation();
        }
    }

    //end of vimeo functions

    // --- Navigation Logic ---
    const aboutHeading = document.getElementById('about-heading');
    const filmsHeading = document.getElementById('films-heading-1'); 
    const filmsSectionWrapper = document.getElementById('films-section-wrapper-module1'); 

    const updateNavigationState = () => {
        if (!aboutHeading || !filmsHeading) return; 

        const remToPxRatio = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const requiredTopOffsetPx = 9.5 * remToPxRatio;
        const aboutHeadingRect = aboutHeading.getBoundingClientRect();

        if (aboutHeadingRect.top >= requiredTopOffsetPx) {
            aboutHeading.classList.add('active-nav-link');
            filmsHeading.classList.add('active-nav-link');
        } else {
            aboutHeading.classList.remove('active-nav-link');
            filmsHeading.classList.remove('active-nav-link');
        }
    };
    
    const scrollToElementWithTopOffset = (targetElement, offsetRem = 9.02) => {
        if (!targetElement) {
            console.warn("Scroll target element not found.");
            return;
        }

        const remToPxRatio = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const offsetPx = offsetRem * remToPxRatio;

        const elementRect = targetElement.getBoundingClientRect();
        const elementAbsoluteTop = elementRect.top + mainContentWrapper.scrollTop;

        let targetScrollY = elementAbsoluteTop - offsetPx;
        targetScrollY = Math.max(0, targetScrollY); 

        customSmoothScroll(targetScrollY, 1500);
    };


    if (aboutHeading && filmsHeading && filmsSectionWrapper) { 
        updateNavigationState(); 
        mainContentWrapper.addEventListener('scroll', updateNavigationState); 
        window.addEventListener('resize', updateNavigationState); 

        aboutHeading.addEventListener('click', () => {
            scrollToElementWithTopOffset(aboutHeading);
        });
        filmsHeading.addEventListener('click', () => {
            scrollToElementWithTopOffset(filmsSectionWrapper);
        }); 

    } else {
        console.error("Navigation elements (ABOUT/FILMS headings, filmsSectionWrapper) not found for navigation setup.");
    }

    // Prevent context menu
    const videoPlaceholderDivForCtxMenu = document.getElementById('video-placeholder-div'); 
    document.querySelectorAll('img').forEach(img => {
        img.addEventListener('contextmenu', (e) => { e.preventDefault(); });
    });
    if (videoPlaceholderDivForCtxMenu) { 
        videoPlaceholderDivForCtxMenu.addEventListener('contextmenu', (e) => { e.preventDefault(); });
    } else {
        console.warn("Video placeholder div not found for context menu prevention.");
    }

    //adding the video

    if (vimeoIframe) {
        vimeoIframe.src = `https://player.vimeo.com/video/${VIMEO_VIDEO_ID}?autoplay=1&loop=1&muted=1&controls=0&autopause=0&dnt=1&pip=0`;
        vimeoPlayer = new Vimeo.Player(vimeoIframe);

        let vimeoReadyAndPlayTimeoutReached = false;
        const vimeoReadinessAndPlayTimeoutDuration = 5000; 

        const vimeoReadinessTimer = setTimeout(() => {
            if (!isVimeoReadyAndPlayingForFade) { 
                console.warn(`Vimeo readiness and 'play' event timeout (${vimeoReadinessAndPlayTimeoutDuration / 1000}s). Forcing fade process.`);
                vimeoReadyAndPlayTimeoutReached = true;
                isVimeoReadyAndPlayingForFade = true; 
                checkAndStartAllSystemsGoFade();
            }
        }, vimeoReadinessAndPlayTimeoutDuration);

        vimeoPlayer.ready().then(() => {
            console.log('Vimeo player API is ready. Attaching all button listeners.');
            setupNavigationInteractions(); // Ensure navigation interactions are set up after player is ready

            vimeoPlayer.getPaused().then(paused => { 
                isCustomVideoPlaying = !paused; 
                if (typeof updatePlayPauseButton === 'function') updatePlayPauseButton(); 
            });
            if (typeof updateVideoMuteState === 'function') updateVideoMuteState(); 
            
            if (videoInteractionOverlay) {
                videoInteractionOverlay.addEventListener('mouseenter', () => { 
                    if (canShowControlsOnInitialMove && typeof showVideoControls === 'function') { 
                        showVideoControls();
                    }
                });
            }

            if (customPlayPauseButton) {
                customPlayPauseButton.addEventListener('click', (e) => {
                    e.stopPropagation(); 
                    console.log("Play/Pause button clicked"); 
                    if (isCustomVideoPlaying) {
                        vimeoPlayer.pause().catch(err => console.error("Error pausing video:", err));
                    } else {
                        vimeoPlayer.play().catch(err => console.error("Error playing video:", err));
                    }
                    if (typeof updateFullscreenButton === 'function') {
                        updateFullscreenButton(); 
                    }
                    if (typeof showVideoControls === 'function') showVideoControls(); 
                });
                customPlayPauseButton.addEventListener('mouseenter', () => {
                    isMouseOverPlayPauseButton = true; // Set flag
                    // console.log("PLAY/PAUSE BTN MOUSEENTER");
                    // Add any other specific hover effects for the play/pause button if needed
                });

                customPlayPauseButton.addEventListener('mouseleave', () => {
                    isMouseOverPlayPauseButton = false; // Clear flag
                    // console.log("PLAY/PAUSE BTN MOUSELEAVE");
                    // Add any other specific mouseleave effects for the play/pause button if needed
                });
            } else {
                console.warn("Custom play/pause button not found for listener attachment.");
            }

            if (customMuteUnmuteButton) {
                customMuteUnmuteButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // console.log("MUTE BTN CLICK: Start. Current isVideoMuted (before action) = " + isVideoMuted);
                    if (!vimeoPlayer) {
                        console.error("MUTE BTN CLICK: Vimeo player not available!");
                        return;
                    }

                    const currentLocalMuteState = isVideoMuted;
                    const newPlayerMuteState = !currentLocalMuteState;

                    vimeoPlayer.setMuted(newPlayerMuteState)
                        .catch(err => {
                            console.error("Error in setMuted(" + newPlayerMuteState + ") promise:", err.name, err.message);
                            if (typeof updateVideoMuteState === 'function') updateVideoMuteState();
                        });

                    // --- IMMEDIATE ICON TOGGLE ON CLICK to show next potential action (using classes) ---
                    const anticipatedIsVideoMutedAfterClick = newPlayerMuteState;
                    // console.log("MUTE BTN CLICK: Anticipated isVideoMuted after this click = " + anticipatedIsVideoMutedAfterClick);
                    if (anticipatedIsVideoMutedAfterClick) { // Video WILL BE Muted. Next action displayed is "Unmute" (show unmute SVG).
                        customMuteUnmuteButton.classList.remove('display-mute-svg');
                        customMuteUnmuteButton.classList.add('display-unmute-svg');
                        customMuteUnmuteButton.title = "Click to Unmute";
                    } else { // Video WILL BE Unmuted. Next action displayed is "Mute" (show mute SVG).
                        customMuteUnmuteButton.classList.remove('display-unmute-svg');
                        customMuteUnmuteButton.classList.add('display-mute-svg');
                        customMuteUnmuteButton.title = "Click to Mute";
                    }
                    // --- END IMMEDIATE ICON TOGGLE ---

                    if (typeof showVideoControls === 'function') {
                        showVideoControls();
                    }
                });
            } else {
                console.warn("Custom mute/unmute button not found for event listener attachment.");
            }

            if (customFullscreenButton) {
                customFullscreenButton.addEventListener('click', (e) => {
                    e.stopPropagation(); // PREVENT EVENT BUBBLING to fix mute toggle issue
                    // console.log("Fullscreen button CLICKED.");

                    const isTouchMode = currentLayoutMode === 'mixed_touch' || currentLayoutMode === 'phone_portrait_touch';

                    if (isTouchMode) {
                        // --- Mobile/Touch Logic: Use Vimeo Player API ---
                        console.log("Using Vimeo API for fullscreen toggle.");
                        vimeoPlayer.getFullscreen().then(fullscreen => {
                            if (fullscreen) {
                                vimeoPlayer.exitFullscreen().catch(err => console.error("Error exiting fullscreen via API:", err));
                            } else {
                                vimeoPlayer.requestFullscreen().catch(err => console.error("Error entering fullscreen via API:", err));
                            }
                        }).catch(err => {
                            console.error("Could not get fullscreen state via API, trying fallback:", err);
                            const isCurrentlyFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
                            if (isCurrentlyFullscreen) { vimeoPlayer.exitFullscreen(); } 
                            else { vimeoPlayer.requestFullscreen(); }
                        });
                    } else

                        if (!vimeoPlayer && !document.fullscreenEnabled && !document.webkitFullscreenEnabled && !document.mozFullScreenEnabled && !document.msFullscreenEnabled) {
                            console.error("Fullscreen click: Fullscreen API not available or player not ready.");
                            return;
                        }

                        const videoContainer = document.getElementById('video-placeholder-div');
                        if (!videoContainer) {
                            console.error("Fullscreen click: video-placeholder-div not found.");
                            return;
                        }

                        const isCurrentlyFullscreen = (
                            document.fullscreenElement === videoContainer ||
                            document.webkitFullscreenElement === videoContainer ||
                            document.mozFullScreenElement === videoContainer ||
                            document.msFullscreenElement === videoContainer
                        );
                        
                        // console.log("Fullscreen button CLICK: isCurrentlyFullscreen before action =", isCurrentlyFullscreen);

                        if (isCurrentlyFullscreen) {
                            // console.log("Attempting to exit fullscreen...");
                            if (document.exitFullscreen) {
                                document.exitFullscreen().catch(err => console.error("Error exiting fullscreen:", err));
                            } else if (document.webkitExitFullscreen) {
                                document.webkitExitFullscreen().catch(err => console.error("Error exiting fullscreen (webkit):", err));
                            } else if (document.mozCancelFullScreen) { // Older Firefox
                                document.mozCancelFullScreen().catch(err => console.error("Error exiting fullscreen (moz):", err));
                            } else if (document.msExitFullscreen) {
                                document.msExitFullscreen().catch(err => console.error("Error exiting fullscreen (ms):", err));
                            } else {
                                console.warn("No method found to exit fullscreen.");
                            }
                        } else {
                            // console.log("Attempting to enter fullscreen on videoContainer...");
                            // Store current mute state BEFORE requesting fullscreen
                            if (vimeoPlayer && typeof vimeoPlayer.getMuted === 'function') {
                                vimeoPlayer.getMuted().then(muted => {
                                    muteStateBeforeFullscreen = muted;
                                    // console.log("Mute state stored before entering fullscreen:", muteStateBeforeFullscreen);
                                }).catch(err => {
                                    console.error("Could not get mute state before fullscreen:", err);
                                    muteStateBeforeFullscreen = isVideoMuted; // Fallback to tracked state
                                });
                            } else {
                                muteStateBeforeFullscreen = isVideoMuted; // Fallback
                            }

                            if (videoContainer.requestFullscreen) {
                                videoContainer.requestFullscreen().catch(err => console.error("FS Error:", err));
                            } else if (videoContainer.webkitRequestFullscreen) {
                                videoContainer.webkitRequestFullscreen().catch(err => console.error("FS Error (webkit):", err));
                            } else if (videoContainer.mozRequestFullScreen) { // Older Firefox
                                videoContainer.mozRequestFullScreen().catch(err => console.error("FS Error (moz):", err));
                            } else if (videoContainer.msRequestFullscreen) {
                                videoContainer.msRequestFullscreen().catch(err => console.error("FS Error (ms):", err));
                            } else {
                                console.warn("No method found to request fullscreen for container.");
                            }
                        }
                        // The 'fullscreenchange' document event listener will handle calling updateFullscreenButton()
                        showVideoControls(); // Ensure controls are shown after fullscreen toggle
                });

                // Your mouseenter/mouseleave listeners for isMouseOverFullscreenButton remain the same
                customFullscreenButton.addEventListener('mouseenter', () => { isMouseOverFullscreenButton = true; });
                customFullscreenButton.addEventListener('mouseleave', () => { isMouseOverFullscreenButton = false; });
            }

            // Fullscreen change event listeners

            ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(eventType => {
                document.addEventListener(eventType, () => { // Removed async here as player methods return promises
                    // console.log('DOCUMENT EVENT:', eventType, 'detected.');
                    
                    if (typeof updateFullscreenButton === 'function') {
                        updateFullscreenButton(); // Update the fullscreen button's icon
                    }

                    const videoContainer = document.getElementById('video-placeholder-div');
                    const isNowActuallyFullscreen = (
                        document.fullscreenElement === videoContainer ||
                        document.webkitFullscreenElement === videoContainer ||
                        document.mozFullScreenElement === videoContainer ||
                        document.msFullscreenElement === videoContainer
                    );

                    if (isNowActuallyFullscreen) {
                        // console.log("Entered fullscreen state via event.");
                        if (vimeoPlayer && muteStateBeforeFullscreen !== null && 
                            typeof vimeoPlayer.getMuted === 'function' && 
                            typeof vimeoPlayer.setMuted === 'function') {
                            
                            vimeoPlayer.getMuted().then(currentMuteStateInFS => {
                                // console.log(`In fullscreen: Player mute is ${currentMuteStateInFS}, intended was ${muteStateBeforeFullscreen}`);
                                if (currentMuteStateInFS !== muteStateBeforeFullscreen) {
                                    // console.log(`Restoring mute state to ${muteStateBeforeFullscreen}...`);
                                    vimeoPlayer.setMuted(muteStateBeforeFullscreen)
                                        .then(() => {
                                            // console.log("Mute state restored in fullscreen.");
                                            // The volumechange event from setMuted should update isVideoMuted and the mute button icon.
                                        })
                                        .catch(e => console.error("Error restoring mute state in fullscreen:", e));
                                }
                            }).catch(e => console.error("Error getting mute state in fullscreen:", e));
                        }
                        // Ensure controls are briefly visible when entering fullscreen
                        if (typeof showVideoControls === 'function') {
                            // console.log("Showing controls on entering fullscreen.");
                            showVideoControls();
                        }
                    } else {
                        // console.log("Exited fullscreen state via event.");
                        muteStateBeforeFullscreen = null; // Reset
                        // Ensure controls are briefly visible when exiting fullscreen
                        if (typeof showVideoControls === 'function') {
                            // console.log("Showing controls on exiting fullscreen.");
                            showVideoControls();
                        }
                    }
                });
            });

            // Initial state update for the fullscreen button
            //if (typeof updateFullscreenButton === 'function') {
            //    updateFullscreenButton();
            //}

            vimeoPlayer.on('play', () => {
                if (!isVimeoReadyAndPlayingForFade && !vimeoReadyAndPlayTimeoutReached) {
                    clearTimeout(vimeoReadinessTimer);
                    isVimeoReadyAndPlayingForFade = true;
                    checkAndStartAllSystemsGoFade();
                }
                isCustomVideoPlaying = true;
                if (typeof updatePlayPauseButton === 'function') updatePlayPauseButton();
            });

            vimeoPlayer.on('pause', () => {
                isCustomVideoPlaying = false;
                if (typeof updatePlayPauseButton === 'function') updatePlayPauseButton();
            });

            vimeoPlayer.on('volumechange', () => { 
                if (typeof updateVideoMuteState === 'function') updateVideoMuteState();
            });

            vimeoPlayer.on('loaded', () => {
                if (!isVimeoReadyAndPlayingForFade && !vimeoReadyAndPlayTimeoutReached) { 
                    clearTimeout(vimeoReadinessTimer);
                }
            });

        }).catch(error => { 
            console.error("Error initializing Vimeo player API (ready promise):", error);
            if (!vimeoReadyAndPlayTimeoutReached && !isVimeoReadyAndPlayingForFade) {
                clearTimeout(vimeoReadinessTimer);
                isVimeoReadyAndPlayingForFade = true; 
                checkAndStartAllSystemsGoFade();
            }
        });
    } else { 
        console.warn("Vimeo iframe not found for player initialization.");
        isVimeoReadyAndPlayingForFade = true; 
    }
    
    const initialBuffer = document.getElementById('initial-buffer');
    const scrollOverlay = document.getElementById('scroll-overlay');
    const aboutHeadingElementForInitialLoad = document.getElementById('about-heading'); 
    const videoShowreelSectionForInitialLoad = document.getElementById('video-showreel-section');

    window.addEventListener('resize', handleLayoutRecalculation);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleLayoutRecalculation);
    }

    if (initialBuffer && fadeOverlay && aboutHeadingElementForInitialLoad && videoShowreelSectionForInitialLoad) {
        window.addEventListener('load', () => {
            console.log("Window loaded. Performing initial layout.");
            
            handleLayoutRecalculation(); 

            windowHasLoadedForFade = true;
            checkAndStartAllSystemsGoFade();

            // Failsafe timeout logic remains the same
            setTimeout(() => {
                if (!fadeInitiatedBySystem) {
                    console.warn("Master timeout for fade initiation (7s). Forcing conditions.");
                    isVimeoReadyAndPlayingForFade = true;
                    windowHasLoadedForFade = true;
                    checkAndStartAllSystemsGoFade();
                }
            }, 7000);

            if (fadeOverlay) {
                fadeOverlay.addEventListener('transitionend', () => {
                    fadeTransitionFired = true;
                    if (fadeOverlay) fadeOverlay.style.display = 'none';
                }, { once: true });
            }
        });

        // --- MODIFIED: Scroll listener with DYNAMIC limit and debounced correction ---
        let scrollCorrectionTimeout;
        const desiredHeadroomRemMobile = 165;
        const desiredHeadroomRemMixedTouch = 10;
        const HARD_HEADROOM_REM_MOBILE = 165.1;
        const HARD_HEADROOM_REM_MIXED_TOUCH = 10.1;

        // This function is now called on touchend to handle the soft limit.
        function checkAndCorrectScrollPosition() {
            if (isUserTouching) return; // Don't correct if another touch has already started

            const videoShowreelSection = document.getElementById('video-showreel-section');
            if (!videoShowreelSection) return;

            const isMobile = (currentLayoutMode === 'phone_portrait_touch');
            const remToPxRatio = parseFloat(getComputedStyle(document.documentElement).fontSize);
            
            const softHeadroom = (isMobile) ? desiredHeadroomRemMobile : desiredHeadroomRemMixedTouch;
            const softHeadroomPx = softHeadroom * remToPxRatio;

            const videoTopAbsolute = videoShowreelSection.getBoundingClientRect().top + mainContentWrapper.scrollTop;
            const softLimitPx = videoTopAbsolute - softHeadroomPx;

            // If we are still above the soft limit after the touch has ended, animate back.
            if (mainContentWrapper.scrollTop < softLimitPx) {
                console.log(`Touch ended in headroom. Gently scrolling back to soft limit: ${softLimitPx.toFixed(0)}px`);
                customSmoothScroll(softLimitPx, 300);
            }
        }

        // The scroll listener now only handles the hard limit during inertial scrolling.
        mainContentWrapper.addEventListener('scroll', () => {
            if (typeof updateNavigationState === 'function') {
                updateNavigationState();
            }
            if (!initialLoadAndPositioningCompleted) return;

            if (currentLayoutMode === 'phone_portrait_touch' || currentLayoutMode === 'mixed_touch') {
                // --- HARD LIMIT ENFORCEMENT ---
                // This logic only runs when the user is NOT touching (i.e., during a fling).
                if (!isUserTouching) {
                    const videoShowreelSection = document.getElementById('video-showreel-section');
                    if (!videoShowreelSection) return;

                    const isMobile = (currentLayoutMode === 'phone_portrait_touch');
                    const remToPxRatio = parseFloat(getComputedStyle(document.documentElement).fontSize);
                    
                    const hardHeadroom = (isMobile) ? HARD_HEADROOM_REM_MOBILE : HARD_HEADROOM_REM_MIXED_TOUCH;
                    const hardHeadroomPx = hardHeadroom * remToPxRatio;
                    
                    const videoTopAbsolute = videoShowreelSection.getBoundingClientRect().top + mainContentWrapper.scrollTop;
                    const hardLimitPx = videoTopAbsolute - hardHeadroomPx;
                    
                    // If an inertial fling goes past the hard limit, snap it back.
                    // This does not cause flicker because the user's finger is not fighting it.
                    if (mainContentWrapper.scrollTop < hardLimitPx) {
                        mainContentWrapper.scrollTop = hardLimitPx;
                        //checkAndCorrectScrollPosition();
                    }
                }
            } else {
                // --- Desktop scroll lock logic remains unchanged and flicker-free ---
                if (mainContentWrapper.scrollTop < finalScrollTargetY) {
                mainContentWrapper.scrollTop = finalScrollTargetY;
                }
            }
        });

    } else {
        let missing = ["initialBuffer", "fadeOverlay", "aboutHeadingElementForInitialLoad", "videoShowreelSectionForInitialLoad"]
            .map(id => { 
                let elId = id;
                if (id === "aboutHeadingElementForInitialLoad") elId = "about-heading";
                if (id === "videoShowreelSectionForInitialLoad") elId = "video-showreel-section";
                return document.getElementById(elId) ? null : id;
            })
            .filter(id => id !== null);
        console.error("One or more critical elements for initial load not found: " + missing.join(', '));
        if(fadeOverlay) { 
            fadeOverlay.style.opacity = '0';
            fadeOverlay.style.pointerEvents = 'none';
            setTimeout(() => { if (fadeOverlay) fadeOverlay.style.display = 'none'; }, 2500);
        }
    }
});

