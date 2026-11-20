(() => {
  'use strict';
  const data = window.FORECAST_DEMO;
  const $ = (selector) => document.querySelector(selector);
  const NS = 'http://www.w3.org/2000/svg';
  const addSVG = (parent, tag, attributes, text) => {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (text) element.textContent = text;
    parent.appendChild(element);
    return element;
  };
  if (data) {
    const xHistory = (t) => 40 + (t + 24) / 24 * 290;
    const xFuture = (t) => 330 + t / 24 * 414;
    const y = (value) => 237 - (value - .2) / .7 * 222;
    const path = (times, values, x) => times.map((t, i) => `${i ? 'L' : 'M'}${x(t).toFixed(2)},${y(values[i]).toFixed(2)}`).join(' ');
    for (const value of [.2, .4, .6, .8]) {
      addSVG($('#chart-lines'), 'line', {x1:40, x2:744, y1:y(value), y2:y(value), stroke:'#e2e8f0', 'stroke-width':1});
      addSVG($('#chart-axes'), 'text', {x:25, y:y(value)+4, 'text-anchor':'end', class:'svg-label'}, value.toFixed(1));
    }
    for (const [x, label] of [[40,'−24 h'],[185,'−12 h'],[330,'0'],[537,'+12 h'],[744,'+24 h']]) {
      addSVG($('#chart-axes'), 'text', {x, y:263, 'text-anchor':'middle', class:'svg-label'}, label);
    }
    addSVG($('#chart-lines'), 'path', {d:path(data.history_t, data.history, xHistory), 'clip-path':'url(#history-clip)', fill:'none', stroke:'#273a4c', 'stroke-width':2.4, 'stroke-linecap':'round', 'stroke-linejoin':'round'});
    const baselinePath = path(data.future_t, data.baseline, xFuture);
    $('#baseline-line').setAttribute('d', baselinePath);
    const historyReveal = $('#history-reveal');
    const baselineReveal = $('#reveal-rect');
    const adjustedLine = $('#adjusted-line');
    const gapArea = $('#gap-area');
    const forecastDot = $('#forecast-dot');
    const newsMarker = $('#news-marker');
    const originLine = $('#forecast-origin');
    const originLabel = $('#forecast-origin-label');
    const stageLabels = [...document.querySelectorAll('[data-demo-phase]')];
    const eventSteps = [...document.querySelectorAll('[data-event-phase]')];
    let scenario = 'shutdown';
    let phase = '';
    let playing = false;
    let animationId = 0;
    let lastTime = null;
    let elapsed = 0;
    let inView = false;
    let userPaused = false;
    let motionRequested = false;
    const historyDuration = 2800;
    const newsDuration = 2200;
    const adjustmentDuration = 2400;
    const forecastStart = historyDuration + newsDuration;
    const finalFrame = forecastStart + adjustmentDuration;
    const cycleDuration = finalFrame + 2200;
    const clamp = value => Math.max(0, Math.min(1, value));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionAllowed = () => !reducedMotion.matches || motionRequested;
    const metadata = {
      shutdown: {title:'An industrial facility announces a shutdown.', description:'A shutdown announcement signals lower demand before the change appears in load history.', scope:'Local / corporate event', responseTitle:'The forecast shifts downward.', responseDescription:'The shutdown implies lower demand. Event information adjusts the forecast below the numerical baseline.'},
      heatwave: {title:'A warning signals a heatwave ahead.', description:'An advance warning signals higher cooling demand before it appears in recent load.', scope:'State-level event', responseTitle:'The forecast shifts upward.', responseDescription:'The heatwave implies higher cooling demand. Event information adjusts the forecast above the numerical baseline.'}
    };
    const drawStory = () => {
      const nextPhase = elapsed < historyDuration ? 'history' : elapsed < forecastStart ? 'news' : 'forecast';
      if (nextPhase !== phase) {
        phase = nextPhase;
        stageLabels.forEach(label => {
          if (label.dataset.demoPhase === phase) label.setAttribute('aria-current', 'step');
          else label.removeAttribute('aria-current');
        });
        eventSteps.forEach(step => {
          const active = step.dataset.eventPhase === phase;
          step.classList.toggle('is-active', active);
          step.setAttribute('aria-hidden', String(!active));
        });
        const hasNews = phase !== 'history';
        newsMarker.setAttribute('opacity', hasNews ? '1' : '0');
        originLine.setAttribute('stroke', hasNews ? '#265b96' : '#9ba8b9');
        originLabel.textContent = hasNews ? 'News at forecast origin' : 'Forecast origin';
      }
      historyReveal.setAttribute('width', 294 * clamp(elapsed / 1400));
      baselineReveal.setAttribute('width', 418 * clamp((elapsed - 1400) / 1000));
      const progress = clamp((elapsed - forecastStart) / adjustmentDuration);
      const adjustment = progress * progress * (3 - 2 * progress);
      const opacity = phase === 'forecast' ? clamp((elapsed - forecastStart) / 200) : 0;
      adjustedLine.setAttribute('opacity', opacity);
      gapArea.setAttribute('opacity', opacity * .8);
      forecastDot.setAttribute('opacity', opacity);
      if (phase === 'forecast') {
        const values = data.baseline.map((value, i) => value + adjustment * (data.scenarios[scenario][i] - value));
        adjustedLine.setAttribute('d', path(data.future_t, values, xFuture));
        const returnPath = data.future_t.map((_, i) => {
          const j = data.future_t.length - i - 1;
          return `L${xFuture(data.future_t[j]).toFixed(2)},${y(values[j]).toFixed(2)}`;
        }).join(' ');
        gapArea.setAttribute('d', `${baselinePath} ${returnPath} Z`);
        forecastDot.setAttribute('cx', xFuture(24));
        forecastDot.setAttribute('cy', y(values[values.length - 1]));
      }
    };
    const updateButton = () => {
      const active = !userPaused && motionAllowed();
      $('#animation-toggle').setAttribute('aria-label', active ? 'Pause animation' : 'Play animation');
      $('#animation-toggle').setAttribute('aria-pressed', String(!active));
      $('#animation-toggle').textContent = active ? 'Pause' : 'Play';
    };
    const stop = () => {playing = false; cancelAnimationFrame(animationId); lastTime = null;};
    const tick = (time) => {
      if (!playing) return;
      if (lastTime === null) lastTime = time;
      elapsed = (elapsed + time - lastTime) % cycleDuration;
      lastTime = time;
      drawStory();
      animationId = requestAnimationFrame(tick);
    };
    const syncPlayback = () => {
      const shouldPlay = inView && !document.hidden && !userPaused && motionAllowed();
      if (shouldPlay && !playing) {
        playing = true;
        lastTime = null;
        animationId = requestAnimationFrame(tick);
      } else if (!shouldPlay) stop();
      updateButton();
    };
    const setScenario = (name) => {
      stop(); scenario = name;
      $('#event-title').textContent = metadata[name].title;
      $('#event-description').textContent = metadata[name].description;
      $('#event-scope').textContent = metadata[name].scope;
      $('#response-title').textContent = metadata[name].responseTitle;
      $('#response-description').textContent = metadata[name].responseDescription;
      document.querySelectorAll('[data-scenario]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scenario === name)));
      elapsed = motionAllowed() && !userPaused ? 0 : finalFrame;
      drawStory();
      syncPlayback();
    };
    document.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => setScenario(button.dataset.scenario)));
    $('#animation-toggle').addEventListener('click', () => {
      if (!userPaused && motionAllowed()) userPaused = true;
      else {
        userPaused = false;
        motionRequested = true;
        if (elapsed >= finalFrame) {elapsed = 0; drawStory();}
      }
      syncPlayback();
    });
    document.addEventListener('visibilitychange', syncPlayback);
    reducedMotion.addEventListener('change', () => {
      motionRequested = false;
      elapsed = reducedMotion.matches ? finalFrame : 0;
      drawStory();
      syncPlayback();
    });
    setScenario('shutdown');
    const demoObserver = new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting);
      syncPlayback();
    }, {threshold:.15});
    demoObserver.observe($('#forecast-chart'));
  }

  const resultTabs = [...document.querySelectorAll('.results-tab')];
  const selectResultsTab = (activeTab) => {
    resultTabs.forEach(tab => {
      const selected = tab === activeTab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    });
  };
  resultTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectResultsTab(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % resultTabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + resultTabs.length) % resultTabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = resultTabs.length - 1;
      else return;
      event.preventDefault();
      selectResultsTab(resultTabs[next]);
      resultTabs[next].focus();
    });
  });

  const dialog = $('#image-dialog');
  document.querySelectorAll('.figure-zoom').forEach(button => button.addEventListener('click', () => {
    $('#dialog-image').src = button.dataset.image;
    $('#dialog-image').alt = button.querySelector('img').alt;
    $('#dialog-caption').textContent = button.dataset.caption;
    dialog.showModal();
  }));
  $('#close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
  const navLinks = [...document.querySelectorAll('.site-header nav a')];
  const sections = navLinks.map(a => document.querySelector(a.getAttribute('href')));
  const updateNavigation = () => {
    const threshold = $('.site-header').getBoundingClientRect().height + 32;
    let currentSection = null;
    for (const section of sections) {
      if (section && section.getBoundingClientRect().top <= threshold) currentSection = section;
    }
    navLinks.forEach(link => {
      const current = currentSection && link.hash === `#${currentSection.id}`;
      link.classList.toggle('active', Boolean(current));
      if (current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  let navigationFrame = 0;
  const scheduleNavigation = () => {
    if (navigationFrame) return;
    navigationFrame = requestAnimationFrame(() => {navigationFrame = 0; updateNavigation();});
  };
  window.addEventListener('scroll', scheduleNavigation, {passive:true});
  window.addEventListener('resize', scheduleNavigation);
  window.addEventListener('load', scheduleNavigation);
  updateNavigation();
})();
