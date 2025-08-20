(function(){
	function qs(sel, root){ return (root||document).querySelector(sel); }
	function qsa(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }
	function on(el, ev, fn){ el && el.addEventListener(ev, fn); }
	function activate(name){
		qsa('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
		qsa('.panel').forEach(p=>p.classList.toggle('active', p.id==='panel-'+name));
	}
	const tabs = qs('#tabs');
	on(tabs, 'click', (e)=>{ const t=e.target.closest('.tab'); if(!t) return; activate(t.dataset.tab); });
	qsa('a[href^="#"]').forEach(a=> on(a, 'click', (e)=>{ const id=a.getAttribute('href'); if(id && id.length>1){ e.preventDefault(); qs(id)?.scrollIntoView({behavior:'smooth'});} }));

	// Back to top toggle
	(function(){
		const topFab = qs('.top-fab'); if(!topFab) return;
		function tick(){ if(window.scrollY > 300) topFab.classList.add('show'); else topFab.classList.remove('show'); }
		window.addEventListener('scroll', tick, { passive:true }); tick();
		on(topFab,'click',(e)=>{ e.preventDefault(); window.scrollTo({top:0, behavior:'smooth'}); });
	})();

	// Demo chats
	function typeIn(el, text, cls){ const d=document.createElement('div'); d.className='msg '+cls; el.appendChild(d); let i=0; const timer=setInterval(()=>{ d.textContent=text.slice(0, ++i); if(i>=text.length) clearInterval(timer); }, 12); el.scrollTop = el.scrollHeight; }
	const chat1 = qs('#chat-demo-1'); const input1 = qs('#input-1'); const send1 = qs('#send-1');
	on(send1,'click',()=>{ const q=(input1.value||'').trim(); if(!q) return; typeIn(chat1,q,'me'); setTimeout(()=>typeIn(chat1,"Here's a concise answer with one helpful follow-up question. How else can I help?",'bot'),400); input1.value=''; });
	qsa('#chips-1 .chip').forEach(c=> on(c,'click',()=>{ input1.value = c.dataset.text || ''; send1.click(); }));

	const rules = { pricing:'Plans start free. Contact us to enable production features.', hello:'Hi there! How can I help you today?', help:'Menu: 1) Ask a question 2) Upload a PDF 3) /reset context', menu:'1) Ask a question\n2) Upload to KB\n3) /reset context' };
	const chat2 = qs('#chat-demo-2'); const input2 = qs('#input-2'); const send2 = qs('#send-2');
	on(send2,'click',()=>{ const q=(input2.value||'').trim().toLowerCase(); if(!q) return; typeIn(chat2,q,'me'); const ans = rules[q] || 'Sorry, no rule matched. Try: pricing, hello, help, menu'; setTimeout(()=>typeIn(chat2,ans,'bot'),400); input2.value=''; });
	qsa('#chips-2 .chip').forEach(c=> on(c,'click',()=>{ input2.value = c.dataset.text || ''; send2.click(); }));

	// Estimator
	const range = qs('#convRange'); const convInput = qs('#convInput'); const planText = qs('#planText'); const planList = qs('#planList');
	function updatePlan(n){
		let plan='Starter', details=['Dashboard + KB + Auto Replies','1 WhatsApp profile','Email support'];
		if(n>1500 && n<=4000){ plan='Growth'; details=['All Starter','2 profiles','Priority support']; }
		if(n>4000){ plan='Scale'; details=['All Growth','5 profiles','SLA support']; }
		if(planText) planText.textContent = plan+ ' • Good for up to ' + (plan==='Starter'?1500:plan==='Growth'?4000:'∞') + ' conversations/month';
		if(planList) planList.innerHTML = details.map(x=>'<li>'+x+'</li>').join('');
	}
	on(range,'input',()=>{ convInput.value = range.value; updatePlan(Number(range.value||0)); });
	on(convInput,'input',()=>{ const v = Math.max(0, Math.min(10000, Number(convInput.value||0))); convInput.value = v; range.value = v; updatePlan(v); });
	updatePlan(Number(range?.value||1000));

	// Testimonials rotator
	const quotes = [
		['“Super easy to set up and our response time dropped by 70%.”','— Retail brand'],
		['“Uploading our PDFs and answering from them was a game changer.”','— Services company'],
		['“Bulk sender saved us hours every week.”','— E‑commerce store']
	];
	let qi=0; const quoteEl = qs('#quote'); const authorEl = qs('#author');
	setInterval(()=>{ if(!quoteEl||!authorEl) return; qi=(qi+1)%quotes.length; quoteEl.textContent = quotes[qi][0]; authorEl.textContent = quotes[qi][1]; }, 4000);

	// Lead form
	const leadForm = qs('#leadForm'); const leadThanks = qs('#leadThanks');
	on(leadForm,'submit', async (e)=>{
		e.preventDefault();
		const fd = new FormData(leadForm); const body = Object.fromEntries(fd.entries());
		try{
			const conv = Number(qs('#convInput')?.value||0);
			body.monthlyConversations = conv;
			const r = await fetch('/contact-lead',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
			if(r.ok){ leadThanks.style.display='block'; leadForm.reset(); }
		}catch(err){ /* no-op */ }
	});

	// Hero email capture to /contact-lead
	(function(){
		const form = qs('#ctaEmailForm'); if(!form) return;
		on(form,'submit', async (e)=>{
			e.preventDefault();
			const fd = new FormData(form); const email = fd.get('email');
			try{
				await fetch('/contact-lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
				qs('#ctaEmailThanks').style.display='inline';
				form.reset();
			}catch{}
		});
	})();

	// Reveal on scroll
	const io = new IntersectionObserver((entries)=>{
		entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('show'); io.unobserve(e.target); } });
	},{ threshold: 0.08 });
	qsa('.reveal').forEach(el=> io.observe(el));

	// Device mock type-in (hero)
	(function(){
		const chat = qs('.device-chat'); if(!chat) return; 
		function bubble(text, cls){ const b=document.createElement('div'); b.className='bubble '+cls; chat.appendChild(b); let i=0; const t=setInterval(()=>{ b.textContent=text.slice(0,++i); chat.scrollTop=chat.scrollHeight; if(i>=text.length) clearInterval(t); }, 10); }
		setTimeout(()=>bubble('Hi! Need help automating WhatsApp?','bot'), 1200);
		setTimeout(()=>bubble('Can you reply from PDFs?','me'), 2400);
		setTimeout(()=>bubble('Yes — upload in KB and ask from them.','bot'), 3600);
	})();

	// Animated counters
	(function(){
		const counters = qsa('.counter'); if(!counters.length) return;
		const obs = new IntersectionObserver((entries)=>{
			entries.forEach(entry=>{
				if(!entry.isIntersecting) return;
				const el = entry.target; const target = Number(el.dataset.target||0); let cur = 0; const step = Math.ceil(target/60);
				const t = setInterval(()=>{ cur+=step; if(cur>=target){ cur=target; clearInterval(t);} el.textContent = cur.toLocaleString(); }, 20);
				obs.unobserve(el);
			});
		},{threshold:0.3});
		counters.forEach(c=> obs.observe(c));
	})();

	// Pricing toggle
	(function(){
		const toggle = qs('#billingToggle'); if(!toggle) return;
		function apply(){ const yearly = toggle.checked; qsa('.price').forEach(p=>{ const v = p.getAttribute(yearly?'data-yearly':'data-monthly'); if(v) p.textContent = v; }); }
		on(toggle,'change', apply); apply();
	})();
})();
