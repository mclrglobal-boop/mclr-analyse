import { useTitle } from '../lib/useAsync';

const CONTACT = 'mclr.global@gmail.com';

const faqs: [string, string][] = [
  ['MCLR est-il un laboratoire ?', "Non. MCLR commercialise des prestations d'analyse confiées à des laboratoires tiers indépendants, qui réalisent réellement les analyses. MCLR publie ensuite un certificat de vérification reprenant fidèlement leurs résultats."],
  ['Quelle différence entre le rapport du laboratoire et le certificat MCLR ?', "Le rapport d'analyse est émis par le laboratoire. Le certificat de vérification est émis par MCLR : il reprend les résultats sans les modifier et permet de les vérifier en ligne via un QR code."],
  ['Comment envoyer mon échantillon ?', "Après paiement, vous recevez par email vos références (ORD-… et SMP-…) et l'adresse d'envoi. Envoyez l'échantillon directement au laboratoire en inscrivant ces références sur le colis et sur le flacon."],
  ['Comment vérifier un certificat ?', "Scannez le QR code du certificat ou saisissez son identifiant (COA-XXXXXXXX) sur la page « Vérifier un certificat ». La page affiche les données enregistrées dans notre base et le statut du certificat."],
  ["Qu'est-ce qu'un certificat révoqué ?", "Un certificat peut être révoqué si le rapport source est retiré ou corrigé. Il reste consultable mais est clairement signalé comme n'étant plus valide."],
  ['Un certificat peut-il être modifié ?', "Jamais silencieusement. Toute correction crée une nouvelle version datée et motivée ; la page de vérification affiche toujours la version en vigueur et l'historique."],
  ['Quels sont les délais ?', "Le délai indicatif est affiché sur chaque analyse et court à partir de la réception de l'échantillon par le laboratoire."],
];

export function Faq() {
  useTitle('Questions fréquentes');
  return (
    <div className="container-x max-w-3xl py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }) }} />
      <h1 className="text-3xl font-bold">Questions fréquentes</h1>
      <div className="mt-8 divide-y divide-line rounded-xl border border-line bg-white">
        {faqs.map(([q, a]) => (
          <details key={q} className="group p-5">
            <summary className="cursor-pointer list-none font-semibold"><span className="mr-2 text-brand group-open:hidden">+</span><span className="mr-2 hidden text-brand group-open:inline">−</span>{q}</summary>
            <p className="mt-3 leading-relaxed text-ink-700">{a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

export function About() {
  useTitle('À propos');
  return (
    <div className="container-x prose-x max-w-3xl py-12">
      <h1 className="text-3xl font-bold">À propos de MCLR</h1>
      <p className="mt-4">MCLR simplifie l&apos;accès à des analyses de produits et rend leurs résultats vérifiables par tous.</p>
      <h2>Notre rôle</h2>
      <ul>
        <li>Nous proposons et encaissons les prestations d&apos;analyse.</li>
        <li>Nous transmettons la commande à un laboratoire tiers indépendant, qui réalise l&apos;analyse.</li>
        <li>Nous reprenons fidèlement les résultats, après contrôle, dans un certificat de vérification.</li>
        <li>Nous publions chaque certificat avec un QR code unique et un historique traçable.</li>
      </ul>
      <h2>Intégrité des résultats</h2>
      <p>Les valeurs sont enregistrées telles qu&apos;elles figurent dans le rapport source, validées avant publication, puis figées : toute correction donne lieu à une nouvelle version datée et motivée.</p>
    </div>
  );
}

export function Contact() {
  useTitle('Contact');
  return (
    <div className="container-x max-w-2xl py-12">
      <h1 className="text-3xl font-bold">Contact</h1>
      <div className="card mt-8 space-y-4 p-6">
        <p className="text-ink-700">Pour toute question sur une commande, indiquez votre référence (ORD-…).</p>
        <a href={`mailto:${CONTACT}`} className="btn-primary">{CONTACT}</a>
        <p className="text-sm text-ink-500">Pour signaler un certificat suspect, indiquez son identifiant (COA-…) et, si possible, une photo du document.</p>
      </div>
    </div>
  );
}

export function Cgv() {
  useTitle('Conditions générales de vente');
  return (
    <div className="container-x prose-x max-w-3xl py-12">
      <h1 className="text-3xl font-bold">Conditions générales de vente</h1>
      <h2>1. Objet</h2><p>Les présentes conditions régissent la vente par MC.LR L.L.C. (« MCLR ») de prestations d&apos;analyse réalisées par des laboratoires tiers indépendants, et l&apos;émission de certificats de vérification.</p>
      <h2>2. Nature de la prestation</h2><p>MCLR agit en qualité d&apos;intermédiaire et n&apos;est pas un laboratoire. Le certificat de vérification reprend les résultats du rapport du laboratoire et ne constitue pas un rapport de laboratoire.</p>
      <h2>3. Commande et paiement</h2><p>La commande est ferme après paiement en ligne via Stripe. Une référence unique est attribuée et les instructions d&apos;envoi de l&apos;échantillon sont communiquées par email.</p>
      <h2>4. Échantillons</h2><p>Le client est responsable de la conformité, de l&apos;emballage et de l&apos;acheminement de son échantillon, et garantit être autorisé à le faire analyser et à l&apos;expédier. Les échantillons ne sont pas restitués. Produits destinés à la recherche uniquement.</p>
      <h2>5. Délais</h2><p>Les délais sont indicatifs et courent à compter de la réception de l&apos;échantillon par le laboratoire.</p>
      <h2>6. Résultats et certificats</h2><p>Les résultats sont ceux communiqués par le laboratoire ; MCLR ne garantit pas un résultat donné. Un certificat peut être révoqué si le rapport source est retiré ou corrigé.</p>
      <h2>7. Rétractation et remboursement</h2><p>La prestation commence à la réception de l&apos;échantillon. Avant cet envoi, la commande peut être annulée et remboursée sur simple demande à {CONTACT}.</p>
      <h2>8. Contact</h2><p>{CONTACT}</p>
    </div>
  );
}

export function Privacy() {
  useTitle('Politique de confidentialité');
  return (
    <div className="container-x prose-x max-w-3xl py-12">
      <h1 className="text-3xl font-bold">Politique de confidentialité</h1>
      <h2>Données collectées</h2>
      <ul>
        <li>Commande : nom, email, informations de paiement (traitées par Stripe — nous ne stockons aucune donnée de carte).</li>
        <li>Échantillon et résultats d&apos;analyse liés à votre commande.</li>
        <li>Vérification de certificat : date, identifiant consulté, navigateur et empreinte anonymisée (hachée) de l&apos;adresse IP, à des fins de lutte contre la fraude.</li>
      </ul>
      <h2>Finalités</h2><p>Exécution de la commande, transmission au laboratoire (références d&apos;échantillon uniquement, jamais vos coordonnées), publication des certificats, prévention de la fraude, obligations comptables.</p>
      <h2>Sous-traitants</h2><p>Stripe (paiement), Supabase (hébergement des données, Union européenne), GitHub (hébergement du site), Google (envoi des emails).</p>
      <h2>Données publiques</h2><p>La page de vérification affiche les informations de l&apos;analyse (produit, lot, méthode, résultats) mais jamais vos coordonnées.</p>
      <h2>Vos droits</h2><p>Accès, rectification, effacement (sous réserve des obligations de conservation), opposition : {CONTACT}.</p>
    </div>
  );
}
