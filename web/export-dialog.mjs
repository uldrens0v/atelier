import {customExportName,exportNameLimit} from './export-name.mjs';

export class ExportNameDialog{
 constructor(onDownload){
  this.dialog=document.createElement('dialog');
  this.dialog.className='export-name-dialog';
  this.dialog.setAttribute('aria-labelledby','export-name-title');
  this.dialog.innerHTML=`<form method="dialog">
   <header class="export-name-heading">
    <h2 id="export-name-title">Name your chroma</h2>
    <button type="button" data-close-name aria-label="Close">×</button>
   </header>
   <label for="export-name-input">Chroma name</label>
   <input id="export-name-input" type="text" maxlength="${exportNameLimit}" autocomplete="off" spellcheck="false" placeholder="Enter a name" autofocus>
   <p class="export-name-default">Default <span data-default-name></span></p>
   <div class="export-name-actions">
    <button class="primary" type="submit" value="custom" disabled>Choose name</button>
    <button type="submit" value="default">Use default</button>
   </div>
  </form>`;
  document.body.append(this.dialog);
  this.input=this.dialog.querySelector('input');
  this.submit=this.dialog.querySelector('[value=custom]');
  this.defaultLabel=this.dialog.querySelector('[data-default-name]');
  this.dialog.querySelector('[data-close-name]').onclick=()=>this.dialog.close();
  this.input.oninput=()=>{this.submit.disabled=!customExportName(this.input.value)};
  this.dialog.querySelector('form').onsubmit=event=>{
   event.preventDefault();
   const useDefault=event.submitter?.value==='default';
   const name=useDefault?'':customExportName(this.input.value);
   if(!useDefault&&!name)return;
   this.dialog.close();
   onDownload(name);
  };
 }
 open(defaultName){
  this.input.value='';
  this.defaultLabel.textContent=defaultName;
  this.submit.disabled=true;
  this.dialog.showModal();
 }
}
