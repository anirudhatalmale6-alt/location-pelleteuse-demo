/*
 * Formulaire de devis : apercu des photos, controle avant envoi, message de
 * retour. Le formulaire fonctionne SANS ce fichier (le PHP revalide tout) ;
 * ce script ne fait que rendre le remplissage plus agreable.
 */
(function () {
  'use strict';

  var MAX_PHOTOS = 6;
  var MAX_OCTETS = 6 * 1024 * 1024;

  function texteEtat(etat, ref) {
    switch (etat) {
      case 'ok': return ['ok',
        'Merci, votre demande est bien arrivee' + (ref ? ' (reference ' + ref + ')' : '') +
        '. Je vous rappelle rapidement, en general dans la journee.'];
      case 'incomplet': return ['ko',
        'Il manque un renseignement obligatoire. Merci de verifier le nom, le telephone, ' +
        'la ville et le type de travaux.'];
      case 'trop': return ['ko',
        'Vous avez envoye plusieurs demandes coup sur coup. Merci de patienter un moment, ' +
        'ou de m\'appeler directement au 06 61 69 40 40.'];
      case 'erreur': return ['ko',
        'L\'envoi a echoue. Appelez-moi au 06 61 69 40 40, c\'est plus rapide.'];
      default: return null;
    }
  }

  function messageRetour() {
    var zone = document.querySelector('[data-lp-message]');
    if (!zone) return;
    var p = new URLSearchParams(window.location.search);
    var r = texteEtat(p.get('etat'), p.get('ref'));
    if (!r) return;
    zone.className = 'lp-message ' + r[0];
    zone.textContent = r[1];
    zone.hidden = false;
    zone.setAttribute('role', 'status');
    zone.scrollIntoView({ block: 'center' });
  }

  function photos(form) {
    var zone = form.querySelector('.lp-photos');
    if (!zone) return;
    var input = zone.querySelector('input[type=file]');
    var apercus = form.querySelector('.lp-apercus');
    var aide = zone.querySelector('.lp-photos_aide');
    var aideInitiale = aide ? aide.textContent : '';
    var retenues = [];

    function redessiner() {
      apercus.innerHTML = '';
      retenues.forEach(function (f, i) {
        var fig = document.createElement('figure');
        var img = document.createElement('img');
        img.alt = f.name;
        img.src = URL.createObjectURL(f);
        img.addEventListener('load', function () { URL.revokeObjectURL(img.src); });
        var sup = document.createElement('button');
        sup.type = 'button';
        sup.textContent = '×';
        sup.setAttribute('aria-label', 'Retirer ' + f.name);
        sup.addEventListener('click', function () { retenues.splice(i, 1); appliquer(); });
        fig.appendChild(img); fig.appendChild(sup); apercus.appendChild(fig);
      });
      if (aide) {
        aide.textContent = retenues.length
          ? retenues.length + ' photo(s) selectionnee(s) sur ' + MAX_PHOTOS + ' maximum.'
          : aideInitiale;
      }
    }

    /* On reinjecte la selection dans l'input : c'est lui qui part au serveur,
       pas notre tableau. Sans cela, retirer une photo ne retirerait rien. */
    function appliquer() {
      var dt = new DataTransfer();
      retenues.forEach(function (f) { dt.items.add(f); });
      input.files = dt.files;
      redessiner();
    }

    function ajouter(liste) {
      var refus = [];
      Array.prototype.forEach.call(liste, function (f) {
        if (retenues.length >= MAX_PHOTOS) { refus.push(f.name + ' : maximum atteint'); return; }
        if (!/^image\//.test(f.type) && !/\.(heic|heif)$/i.test(f.name)) {
          refus.push(f.name + ' : ce n\'est pas une image'); return;
        }
        if (f.size > MAX_OCTETS) { refus.push(f.name + ' : plus de 6 Mo'); return; }
        if (retenues.some(function (x) { return x.name === f.name && x.size === f.size; })) return;
        retenues.push(f);
      });
      appliquer();
      if (refus.length && aide) { aide.textContent = refus.join(' - '); }
    }

    zone.querySelector('.lp-photos_bouton').addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () { ajouter(input.files); });

    ['dragenter', 'dragover'].forEach(function (e) {
      zone.addEventListener(e, function (ev) { ev.preventDefault(); zone.classList.add('survol'); });
    });
    ['dragleave', 'drop'].forEach(function (e) {
      zone.addEventListener(e, function (ev) { ev.preventDefault(); zone.classList.remove('survol'); });
    });
    zone.addEventListener('drop', function (ev) {
      if (ev.dataTransfer && ev.dataTransfer.files) ajouter(ev.dataTransfer.files);
    });
  }

  function controle(form) {
    /* Sur la demonstration il n'y a pas de PHP : on montre au client ce qu'il
       verrait, sans faire semblant d'avoir envoye quoi que ce soit. */
    var demo = form.hasAttribute('data-lp-demo');

    form.addEventListener('submit', function (e) {
      var premier = null;
      form.querySelectorAll('[required]').forEach(function (ch) {
        var bloc = ch.closest('.lp-champ');
        var vide = !ch.value.trim();
        if (bloc) bloc.classList.toggle('en-erreur', vide);
        ch.setAttribute('aria-invalid', vide ? 'true' : 'false');
        if (vide && !premier) premier = ch;
      });
      if (premier) {
        e.preventDefault();
        premier.focus();
        premier.scrollIntoView({ block: 'center' });
        return;
      }
      if (demo) {
        e.preventDefault();
        var zone = document.querySelector('[data-lp-message]');
        if (zone) {
          zone.className = 'lp-message ok';
          zone.textContent = 'Formulaire complet et valide. Sur le site en ligne, '
            + 'la demande partirait maintenant vers votre boite, photos comprises, '
            + 'et serait enregistree sur le serveur. Ici c\'est une demonstration : '
            + 'rien n\'est envoye.';
          zone.hidden = false;
          zone.scrollIntoView({ block: 'center' });
        }
        return;
      }
      var b = form.querySelector('.lp-envoyer');
      if (b) { b.disabled = true; b.textContent = 'Envoi en cours...'; }
    });

    form.querySelectorAll('[required]').forEach(function (ch) {
      ch.addEventListener('input', function () {
        var bloc = ch.closest('.lp-champ');
        if (bloc && ch.value.trim()) {
          bloc.classList.remove('en-erreur');
          ch.setAttribute('aria-invalid', 'false');
        }
      });
    });
  }

  /* Si le visiteur arrive depuis une page ville, on pre-remplit : une case de
     moins a remplir, c'est une demande de plus qui aboutit. */
  function preremplir(form) {
    var p = new URLSearchParams(window.location.search);
    [['ville', 'ville'], ['dep', 'departement'], ['travaux', 'travaux']].forEach(function (paire) {
      var v = p.get(paire[0]);
      if (!v) return;
      var ch = form.querySelector('[name=' + paire[1] + ']');
      if (ch && !ch.value) ch.value = v;
    });
  }

  function init() {
    messageRetour();
    var form = document.querySelector('[data-lp-devis]');
    if (!form) return;
    photos(form);
    controle(form);
    preremplir(form);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
