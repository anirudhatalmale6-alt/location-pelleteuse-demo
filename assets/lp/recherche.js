/*
 * Moteur de recherche par departement et par commune.
 *
 * Fonctionne sans serveur : les donnees sont dans deux fichiers JSON charges
 * APRES l'affichage de la page, pour ne jamais ralentir son ouverture.
 *
 *  - communes-idf.json : les 1 266 communes d'Ile-de-France (source officielle
 *                        geo.api.gouv.fr). TOUTES sont trouvables.
 *  - couverture.json   : celles qui ont deja leur page dediee.
 *
 * Une commune sans page dediee n'est pas une impasse : on renvoie vers la page
 * du departement, qui sait afficher "vous cherchiez Machin-sur-Orge".
 */
(function () {
  'use strict';

  var BASE = (window.LP_BASE || '');
  var donnees = null, couverture = null, enCours = false, files = [];

  function normaliser(t) {
    return (t || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/['\-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function charger(suite) {
    if (donnees && couverture) { suite(); return; }
    files.push(suite);
    if (enCours) return;
    enCours = true;
    var fait = 0;
    function fini() {
      if (++fait < 2) return;
      files.forEach(function (f) { f(); });
      files = [];
    }
    fetch(BASE + 'assets/lp/communes-idf.json')
      .then(function (r) { return r.json(); })
      .then(function (j) { donnees = j; }).catch(function () { donnees = {communes: [], departements: []}; })
      .then(fini);
    fetch(BASE + 'assets/lp/couverture.json')
      .then(function (r) { return r.json(); })
      .then(function (j) { couverture = j; }).catch(function () { couverture = {couvertes: [], prestations: []}; })
      .then(fini);
  }

  /* Cherche : par nom (debut de mot) ou par code postal. Les grandes villes
     remontent en premier, c'est ce que le visiteur attend. */
  function chercher(saisie, dep) {
    var q = normaliser(saisie);
    if (!q) return [];
    var chiffres = /^\d+$/.test(q);
    var res = [];
    for (var i = 0; i < donnees.communes.length; i++) {
      var c = donnees.communes[i];
      if (dep && c.d !== dep) continue;
      var ok = false, rang = 3;
      if (chiffres) {
        if (c.c.indexOf(q) === 0) { ok = true; rang = 0; }
        else if (c.cs && c.cs.some(function (x) { return x.indexOf(q) === 0; })) { ok = true; rang = 1; }
      } else {
        if (c.r.indexOf(q) === 0) { ok = true; rang = 0; }
        else if ((' ' + c.r).indexOf(' ' + q) > -1) { ok = true; rang = 1; }
        else if (c.r.indexOf(q) > -1) { ok = true; rang = 2; }
      }
      if (ok) res.push([rang, -c.p, c]);
      if (res.length > 400) break;
    }
    res.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    return res.slice(0, 8).map(function (x) { return x[2]; });
  }

  function urlCommune(c, prestation) {
    var couverte = couverture.couvertes.indexOf(c.s) > -1;
    var p = prestation || (couverture.prestations[0] || {}).slug;
    if (couverte && p) return BASE + p + '-' + c.s + '.html';
    var dep = donnees.departements.filter(function (d) { return d.d === c.d; })[0];
    if (!dep) return BASE + 'index.html';
    return BASE + 'location-pelleteuse-' + dep.d + '-' + dep.s + '.html?ville=' + c.s;
  }

  function monter(bloc) {
    var selDep = bloc.querySelector('.lp-dep');
    var champ = bloc.querySelector('.lp-ville');
    var liste = bloc.querySelector('.lp-suggestions');
    var selPre = bloc.querySelector('.lp-prestation');
    var bouton = bloc.querySelector('.lp-go');
    var choisie = null, actif = -1;

    function remplirDepartements() {
      if (selDep.options.length > 1) return;
      donnees.departements.forEach(function (d) {
        var o = document.createElement('option');
        o.value = d.d; o.textContent = d.d + ' - ' + d.n;
        selDep.appendChild(o);
      });
      if (selPre && selPre.options.length <= 1) {
        couverture.prestations.forEach(function (p) {
          var o = document.createElement('option');
          o.value = p.slug; o.textContent = p.libelle;
          selPre.appendChild(o);
        });
      }
    }

    function fermer() { liste.innerHTML = ''; liste.classList.remove('ouverte'); actif = -1; }

    function afficher(items) {
      liste.innerHTML = '';
      if (!items.length) {
        var v = document.createElement('li');
        v.className = 'lp-vide';
        v.textContent = 'Aucune commune trouvee en Ile-de-France.';
        liste.appendChild(v); liste.classList.add('ouverte'); return;
      }
      items.forEach(function (c, i) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.innerHTML = '<span class="lp-n"></span><span class="lp-cp"></span>';
        li.querySelector('.lp-n').textContent = c.n;
        li.querySelector('.lp-cp').textContent = c.c + ' - ' + c.d;
        li.addEventListener('mousedown', function (e) { e.preventDefault(); valider(c); });
        li.addEventListener('mouseenter', function () { surligner(i); });
        liste.appendChild(li);
      });
      liste.classList.add('ouverte');
      liste._items = items;
    }

    function surligner(i) {
      var els = liste.querySelectorAll('li[role=option]');
      for (var k = 0; k < els.length; k++) els[k].classList.toggle('actif', k === i);
      actif = i;
    }

    function valider(c) {
      choisie = c;
      champ.value = c.n + ' (' + c.c + ')';
      fermer();
      partir();
    }

    function partir() {
      if (!choisie) {
        var r = chercher(champ.value, selDep.value);
        if (!r.length) { champ.focus(); return; }
        choisie = r[0];
      }
      window.location.href = urlCommune(choisie, selPre ? selPre.value : null);
    }

    champ.addEventListener('input', function () {
      choisie = null;
      charger(function () {
        remplirDepartements();
        if (champ.value.trim().length < 2) { fermer(); return; }
        afficher(chercher(champ.value, selDep.value));
      });
    });

    champ.addEventListener('focus', function () { charger(remplirDepartements); });
    champ.addEventListener('blur', function () { setTimeout(fermer, 150); });

    champ.addEventListener('keydown', function (e) {
      var items = liste._items || [];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!items.length) return;
        surligner((actif + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (actif > -1 && items[actif]) valider(items[actif]); else partir();
      } else if (e.key === 'Escape') { fermer(); }
    });

    selDep.addEventListener('change', function () {
      choisie = null;
      if (champ.value.trim().length >= 2) {
        charger(function () { afficher(chercher(champ.value, selDep.value)); });
      }
    });

    bouton.addEventListener('click', function (e) {
      e.preventDefault();
      charger(function () { remplirDepartements(); partir(); });
    });

    charger(remplirDepartements);
  }

  /* Sur une page departement : "?ville=xxx" -> on le dit clairement au visiteur
     plutot que de faire comme si de rien n'etait. */
  function rappelVille() {
    var cible = document.querySelector('[data-lp-ville-demandee]');
    if (!cible) return;
    var m = /[?&]ville=([^&]+)/.exec(window.location.search);
    if (!m) return;
    var slug = decodeURIComponent(m[1]);
    charger(function () {
      var c = donnees.communes.filter(function (x) { return x.s === slug; })[0];
      if (!c) return;
      cible.querySelector('.lp-ville-nom').textContent = c.n + ' (' + c.c + ')';
      cible.hidden = false;
    });
  }

  function init() {
    var blocs = document.querySelectorAll('[data-lp-recherche]');
    for (var i = 0; i < blocs.length; i++) monter(blocs[i]);
    rappelVille();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
