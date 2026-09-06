import 'dart:math' as math;
import 'package:flutter/material.dart';

void main() => runApp(const GenoegApp());

class GenoegApp extends StatelessWidget {
  const GenoegApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Heb ik straks genoeg?',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6550A8)),
        scaffoldBackgroundColor: const Color(0xFFF6F4FB),
        cardTheme: const CardThemeData(
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(26))),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(16))),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(16)),
            borderSide: BorderSide(color: Color(0xFFDFDBEA)),
          ),
        ),
      ),
      home: const GenoegPage(),
    );
  }
}

class GenoegPage extends StatefulWidget {
  const GenoegPage({super.key});
  @override
  State<GenoegPage> createState() => _GenoegPageState();
}

class _GenoegPageState extends State<GenoegPage> {
  final values = <String, double>{
    'age': 55, 'stopAge': 60, 'income': 3000, 'spend': 2100, 'capital': 250000,
    'workReduction': 40, 'aowAge': 67, 'aow': 1500, 'pension': 0, 'endAge': 90,
    'buffer': 50000, 'inflation': 2, 'mortgage': 245000, 'mortRate': 3.5, 'mortPayment': 1100,
  };

  late PlanResult result = calculate();

  PlanResult calculate() {
    final p = Plan.from(values);
    final required = requiredNominal(p);
    return PlanResult(
      required,
      simulatePath(p, required),
      simulate(p, 0),
      simulate(p, .03),
      simulate(p, .05),
      mortgageInfo(p),
    );
  }

  void recalc() => setState(() => result = calculate());

  @override
  Widget build(BuildContext context) {
    final p = Plan.from(values);
    final r = result;
    final keptIncome = p.income * (1 - p.workReduction);
    final beforeGap = math.max(0, p.spend - keptIncome).toDouble();
    final afterGap = math.max(0, p.spend - p.aow - p.pension).toDouble();

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 36),
          children: [
            const Text('Heb ik straks genoeg?',
              style: TextStyle(fontSize: 46, height: .98, fontWeight: FontWeight.w900, letterSpacing: -2)),
            const SizedBox(height: 10),
            const Text('Welk rendement heb je minimaal nodig om je gewenste leven te betalen én je buffer intact te houden?',
              style: TextStyle(fontSize: 17, color: Color(0xFF747187), height: 1.45)),
            const SizedBox(height: 18),
            HeroCard(requiredReturn: r.requiredNominal, buffer: p.buffer, endAge: p.endAge),
            const SizedBox(height: 14),
            AppCard(
              title: 'Verloop van je vermogen',
              subtitle: 'Stoppen, AOW/pensioen en hypotheek af zijn zichtbaar gemarkeerd.',
              child: SizedBox(
                height: 320,
                child: WealthChart(path: r.path, buffer: p.buffer, plan: p, mortgage: r.mortgage),
              ),
            ),
            const SizedBox(height: 14),
            AppCard(
              title: 'Wat gebeurt wanneer?',
              child: Column(children: [
                PhaseTile(
                  age: '${p.age.toInt()}–${math.min(p.stopAge, p.aowAge).toInt()}',
                  amount: beforeGap == 0 ? '+${eur(keptIncome - p.spend)}/mnd' : '${eur(beforeGap)}/mnd uit vermogen',
                  label: 'werken vóór stoppen/AOW',
                ),
                if (p.stopAge < p.aowAge)
                  PhaseTile(age: '${p.stopAge.toInt()}–${p.aowAge.toInt()}', amount: '${eur(p.spend)}/mnd uit vermogen', label: 'gestopt, nog geen AOW'),
                if (p.aowAge < p.stopAge)
                  PhaseTile(age: '${p.aowAge.toInt()}–${p.stopAge.toInt()}', amount: '+${eur(keptIncome + p.aow + p.pension - p.spend)}/mnd', label: 'werk + AOW/pensioen'),
                PhaseTile(
                  age: '${math.max(p.stopAge, p.aowAge).toInt()}+',
                  amount: afterGap == 0 ? '+${eur(p.aow + p.pension - p.spend)}/mnd' : '${eur(afterGap)}/mnd uit vermogen',
                  label: 'na stoppen met AOW/pensioen',
                ),
              ]),
            ),
            const SizedBox(height: 14),
            AppCard(
              title: 'Als rendement tegenvalt',
              child: Column(children: [
                StressRow(label: '0%', sim: r.zero, buffer: p.buffer),
                StressRow(label: '3%', sim: r.three, buffer: p.buffer),
                StressRow(label: '5%', sim: r.five, buffer: p.buffer),
              ]),
            ),
            const SizedBox(height: 14),
            AppCard(
              title: 'Hypotheek',
              child: Wrap(
                spacing: 10, runSpacing: 10,
                children: [
                  SmallKpi(label: 'Nu', value: '${eur(p.mortPayment)}/mnd'),
                  SmallKpi(label: 'Rente / aflossing', value: '${eur(r.mortgage.interest)} / ${eur(r.mortgage.principal)}'),
                  SmallKpi(label: 'Afgelost rond', value: r.mortgage.endAge.isFinite ? r.mortgage.endAge.toStringAsFixed(1).replaceAll('.', ',') : '—'),
                ],
              ),
            ),
            const SizedBox(height: 14),
            InputsCard(values: values, onChanged: (k,v) => values[k]=v, onCalculate: recalc),
          ],
        ),
      ),
    );
  }
}

class HeroCard extends StatelessWidget {
  final double requiredReturn, buffer, endAge;
  const HeroCard({super.key, required this.requiredReturn, required this.buffer, required this.endAge});
  @override
  Widget build(BuildContext context) {
    final pctText = '${(requiredReturn * 100).clamp(0, 999).toStringAsFixed(1).replaceAll('.', ',')}%';
    return Container(
      padding: const EdgeInsets.all(26),
      decoration: const BoxDecoration(
        gradient: LinearGradient(colors: [Color(0xFF7257B5), Color(0xFF493783)], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.all(Radius.circular(28)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(requiredReturn <= .00001 ? 'Je hebt geen rendement nodig' : 'Benodigd rendement',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 19)),
        const SizedBox(height: 10),
        Text(pctText, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 68, height: .9, letterSpacing: -3)),
        const SizedBox(height: 14),
        Text('Gemiddeld per jaar om tot je ${endAge.toInt()}e te financieren en onderweg minimaal ${eur(buffer)} buffer te houden.',
          style: const TextStyle(color: Color(0xFFEDE8F8), fontSize: 16, height: 1.4)),
      ]),
    );
  }
}

class AppCard extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget child;
  const AppCard({super.key, required this.title, this.subtitle, required this.child});
  @override
  Widget build(BuildContext context) => Card(
    color: Colors.white,
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w900, letterSpacing: -.5)),
        if (subtitle != null) ...[
          const SizedBox(height: 4),
          Text(subtitle!, style: const TextStyle(color: Color(0xFF747187), height: 1.4)),
        ],
        const SizedBox(height: 14),
        child,
      ]),
    ),
  );
}

class PhaseTile extends StatelessWidget {
  final String age, amount, label;
  const PhaseTile({super.key, required this.age, required this.amount, required this.label});
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(bottom: 10),
    padding: const EdgeInsets.all(15),
    decoration: BoxDecoration(
      color: const Color(0xFFEEF4FF),
      border: Border.all(color: const Color(0xFFD9E4F8)),
      borderRadius: BorderRadius.circular(18),
    ),
    child: Row(children: [
      SizedBox(width: 70, child: Text(age, style: const TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF747187)))),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(amount, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 19)),
        Text(label, style: const TextStyle(color: Color(0xFF747187))),
      ])),
    ]),
  );
}

class StressRow extends StatelessWidget {
  final String label;
  final Simulation sim;
  final double buffer;
  const StressRow({super.key, required this.label, required this.sim, required this.buffer});
  @override
  Widget build(BuildContext context) {
    final ok = sim.min >= buffer;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 11),
      child: Row(children: [
        SizedBox(width: 48, child: Text(label, style: const TextStyle(fontWeight: FontWeight.w900))),
        Expanded(child: Text(ok ? '✓ buffer intact' : '! buffer te laag',
          style: TextStyle(fontWeight: FontWeight.w800, color: ok ? const Color(0xFF3978D4) : const Color(0xFFB84B62)))),
        Text('laagste ${eur(sim.min)}', style: const TextStyle(fontWeight: FontWeight.w800)),
      ]),
    );
  }
}

class SmallKpi extends StatelessWidget {
  final String label, value;
  const SmallKpi({super.key, required this.label, required this.value});
  @override
  Widget build(BuildContext context) => Container(
    width: 160,
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: const Color(0xFFFFF8DC), borderRadius: BorderRadius.circular(18)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF747187))),
      const SizedBox(height: 4),
      Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
    ]),
  );
}

class InputsCard extends StatelessWidget {
  final Map<String, double> values;
  final void Function(String, double) onChanged;
  final VoidCallback onCalculate;
  const InputsCard({super.key, required this.values, required this.onChanged, required this.onCalculate});
  @override
  Widget build(BuildContext context) {
    const labels = <String,String>{
      'age':'Leeftijd nu','stopAge':'Volledig stoppen op','income':'Netto inkomen p/m','spend':'Uitgaven p/m',
      'capital':'Belegd vermogen','workReduction':'Minder werken (%)','aowAge':'AOW vanaf','aow':'AOW netto p/m',
      'pension':'Pensioen netto p/m','endAge':'Genoeg tot leeftijd','buffer':'Minimale buffer','inflation':'Inflatie %',
      'mortgage':'Hypotheekschuld','mortRate':'Hypotheekrente %','mortPayment':'Hypotheekbetaling p/m'
    };
    return AppCard(
      title: 'Mijn situatie',
      subtitle: 'Alle details blijven beschikbaar, maar staan onder het antwoord.',
      child: Column(children: [
        LayoutBuilder(builder: (context, constraints) {
          final two = constraints.maxWidth > 560;
          return Wrap(
            spacing: 10, runSpacing: 10,
            children: labels.entries.map((e) => SizedBox(
              width: two ? (constraints.maxWidth-10)/2 : constraints.maxWidth,
              child: TextFormField(
                initialValue: clean(values[e.key]!),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(labelText: e.value),
                onChanged: (v) => onChanged(e.key, double.tryParse(v.replaceAll(',', '.')) ?? values[e.key]!),
              ),
            )).toList(),
          );
        }),
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF6550A8), padding: const EdgeInsets.symmetric(vertical: 17)),
            onPressed: onCalculate,
            child: const Text('Bereken mijn plan', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
          ),
        ),
      ]),
    );
  }
}

class WealthChart extends StatelessWidget {
  final List<WealthPoint> path;
  final double buffer;
  final Plan plan;
  final MortgageInfo mortgage;
  const WealthChart({super.key, required this.path, required this.buffer, required this.plan, required this.mortgage});
  @override
  Widget build(BuildContext context) => CustomPaint(
    painter: WealthPainter(path: path, buffer: buffer, plan: plan, mortgage: mortgage),
    child: Container(),
  );
}

class WealthPainter extends CustomPainter {
  final List<WealthPoint> path;
  final double buffer;
  final Plan plan;
  final MortgageInfo mortgage;
  WealthPainter({required this.path, required this.buffer, required this.plan, required this.mortgage});
  @override
  void paint(Canvas canvas, Size size) {
    if (path.length < 2) return;
    const left=52.0,right=14.0,top=18.0,bottom=30.0;
    final minY=math.min(0.0,path.map((e)=>e.capital).reduce(math.min));
    final maxY=path.map((e)=>e.capital).reduce(math.max);
    final span=math.max(1.0,maxY-minY);
    final yLow=minY-span*.08, yHigh=maxY+span*.08;
    double x(double age)=>left+(age-path.first.age)/(path.last.age-path.first.age)*(size.width-left-right);
    double y(double v)=>top+(yHigh-v)/(yHigh-yLow)*(size.height-top-bottom);

    final grid=Paint()..color=const Color(0xFFEAE7F0)..strokeWidth=1;
    for(var i=0;i<=4;i++){
      final yy=top+(size.height-top-bottom)*i/4;
      canvas.drawLine(Offset(left,yy),Offset(size.width-right,yy),grid);
    }

    final fill=Path()..moveTo(x(path.first.age),y(0));
    for(final p in path){fill.lineTo(x(p.age),y(p.capital));}
    fill.lineTo(x(path.last.age),y(0));fill.close();
    canvas.drawPath(fill,Paint()..color=const Color(0xFFEEF4FF));

    final line=Path()..moveTo(x(path.first.age),y(path.first.capital));
    for(final p in path.skip(1)){line.lineTo(x(p.age),y(p.capital));}
    canvas.drawPath(line,Paint()..color=const Color(0xFF3978D4)..strokeWidth=4..style=PaintingStyle.stroke..strokeCap=StrokeCap.round);

    final bufferPaint=Paint()..color=const Color(0xFFF2C94C)..strokeWidth=2;
    canvas.drawLine(Offset(left,y(buffer)),Offset(size.width-right,y(buffer)),bufferPaint);

    final markerPaint=Paint()..color=const Color(0xFFF2C94C)..strokeWidth=1;
    for(final age in [plan.stopAge,plan.aowAge,if(mortgage.endAge.isFinite)mortgage.endAge]){
      if(age<path.first.age||age>path.last.age)continue;
      final xx=x(age);
      canvas.drawLine(Offset(xx,top),Offset(xx,size.height-bottom),markerPaint);
    }
  }
  @override
  bool shouldRepaint(covariant WealthPainter oldDelegate)=>true;
}

class Plan {
  final double age,stopAge,income,spend,capital,workReduction,aowAge,aow,pension,endAge,buffer,inflation,mortgage,mortRate,mortPayment;
  Plan(this.age,this.stopAge,this.income,this.spend,this.capital,this.workReduction,this.aowAge,this.aow,this.pension,this.endAge,this.buffer,this.inflation,this.mortgage,this.mortRate,this.mortPayment);
  factory Plan.from(Map<String,double> v)=>Plan(v['age']!,v['stopAge']!,v['income']!,v['spend']!,v['capital']!,v['workReduction']!/100,v['aowAge']!,v['aow']!,v['pension']!,v['endAge']!,v['buffer']!,v['inflation']!/100,v['mortgage']!,v['mortRate']!/100,v['mortPayment']!);
}

class WealthPoint { final double age,capital; WealthPoint(this.age,this.capital); }
class Simulation { final double end,min; Simulation(this.end,this.min); }
class MortgageInfo { final double endAge,interest,principal; MortgageInfo(this.endAge,this.interest,this.principal); }
class PlanResult {
  final double requiredNominal; final List<WealthPoint> path; final Simulation zero,three,five; final MortgageInfo mortgage;
  PlanResult(this.requiredNominal,this.path,this.zero,this.three,this.five,this.mortgage);
}

MortgageInfo mortgageInfo(Plan p){
  final r=p.mortRate/12,pay=p.mortPayment;
  if(p.mortgage<=0||pay<=0)return MortgageInfo(p.age,0,0);
  final interest=p.mortgage*r;
  final principal=math.max(0,pay-interest).toDouble();
  if(r<=0)return MortgageInfo(p.age+p.mortgage/pay/12,0,pay);
  if(pay<=interest)return MortgageInfo(double.infinity,interest,0);
  final months=-math.log(1-r*p.mortgage/pay)/math.log(1+r);
  return MortgageInfo(p.age+months/12,interest,principal);
}

Simulation simulate(Plan p,double nominal){
  final real=(1+nominal)/(1+p.inflation)-1;
  var cap=p.capital,min=cap;
  final kept=p.income*(1-p.workReduction),mi=mortgageInfo(p);
  for(var age=p.age.toInt();age<p.endAge.toInt();age++){
    var income=0.0;
    if(age<p.stopAge)income+=kept*12;
    if(age>=p.aowAge)income+=(p.aow+p.pension)*12;
    var spend=p.spend*12;
    if(age>=mi.endAge)spend-=p.mortPayment*12;
    cap=cap*(1+real)+income-spend;
    min=math.min(min,cap);
  }
  return Simulation(cap,min);
}

List<WealthPoint> simulatePath(Plan p,double nominal){
  final real=(1+nominal)/(1+p.inflation)-1;
  var cap=p.capital;
  final out=<WealthPoint>[WealthPoint(p.age,cap)];
  final kept=p.income*(1-p.workReduction),mi=mortgageInfo(p);
  for(var age=p.age.toInt();age<p.endAge.toInt();age++){
    var income=0.0;
    if(age<p.stopAge)income+=kept*12;
    if(age>=p.aowAge)income+=(p.aow+p.pension)*12;
    var spend=p.spend*12;
    if(age>=mi.endAge)spend-=p.mortPayment*12;
    cap=cap*(1+real)+income-spend;
    out.add(WealthPoint(age+1.0,cap));
  }
  return out;
}

double requiredNominal(Plan p){
  bool survives(double nominal){
    final s=simulate(p,nominal);
    return s.end>=p.buffer&&s.min>=p.buffer;
  }
  if(survives(0))return 0;
  var lo=0.0,hi=.30;
  if(!survives(hi))return hi;
  for(var i=0;i<100;i++){
    final mid=(lo+hi)/2;
    if (survives(mid)) { hi=mid; } else { lo=mid; }
  }
  return hi;
}

String eur(double v){
  final sign=v<0?'-':'';
  final n=v.abs().round();
  final s=n.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'),(m)=>'.');
  return '$sign€$s';
}
String clean(double v)=>v==v.roundToDouble()?v.toInt().toString():v.toString();
